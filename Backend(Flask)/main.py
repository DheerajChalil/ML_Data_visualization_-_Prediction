from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
import io

app = Flask(__name__)
CORS(app)


class MedicalBillingAnalyzer:
    def __init__(self):
        self.data = None
        self.model = None
        self.label_encoders = {}
        self.denial_patterns = {}

    def load_data(self, file_content):
        """Load and preprocess the medical billing data with robust encoding handling"""
        try:
            df = None

            # Try to read as Excel first (handles binary Excel files)
            try:
                df = pd.read_excel(io.BytesIO(file_content), header=2)
                print("Successfully loaded as Excel file")
            except Exception as excel_error:
                print(f"Excel read failed: {excel_error}")

                # If Excel fails, try CSV with different encodings
                encodings_to_try = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252', 'utf-16']

                for encoding in encodings_to_try:
                    try:
                        # Decode bytes to string with specific encoding
                        text_content = file_content.decode(encoding)
                        df = pd.read_csv(io.StringIO(text_content), header=2)
                        print(f"Successfully loaded as CSV with {encoding} encoding")
                        break
                    except UnicodeDecodeError as decode_error:
                        print(f"Failed to decode with {encoding}: {decode_error}")
                        continue
                    except Exception as csv_error:
                        print(f"CSV read failed with {encoding}: {csv_error}")
                        continue

                # If all encodings fail, try reading as bytes directly (last resort)
                if df is None:
                    try:
                        # Try pandas read_csv with error handling
                        # df = pd.read_csv(io.BytesIO(file_content), header=1)
                        df = pd.read_excel(io.BytesIO(file_content), header=2, usecols="B:Z")
                        print("Loaded with error ignoring")
                    except Exception as final_error:
                        print(f"Final attempt failed: {final_error}")

            if df is None:
                return False, "Unable to read file. Please ensure it's a valid CSV or Excel file."

            # Check if dataframe is empty
            if df.empty:
                return False, "The uploaded file appears to be empty."

            print(f"Loaded dataframe with shape: {df.shape}")
            print(f"Columns: {list(df.columns)}")

            # Standardize column names
            df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')

            # Map common column variations
            column_mapping = {
                'cpt_code': ['cpt', 'procedure_code', 'cpt_code'],
                'insurance_company': ['insurance', 'payer', 'insurance_company'],
                'physician_name': ['physician', 'provider', 'doctor', 'physician_name'],
                'payment_amount': ['payment', 'paid_amount', 'payment_amount'],
                'balance': ['balance', 'outstanding', 'balance_due'],
                'denial_reason': ['denial_reason', 'reason', 'denial_code', 'reason_code']
            }

            for standard_col, variations in column_mapping.items():
                for var in variations:
                    if var in df.columns:
                        df[standard_col] = df[var]
                        break

            if 'payment_amount' in df.columns:
                df['payment_amount'] = pd.to_numeric(df['payment_amount'], errors='coerce').fillna(0)
            else:
                df['payment_amount'] = 0

            if 'balance' in df.columns:
                df['balance'] = pd.to_numeric(df['balance'], errors='coerce').fillna(0)
            else:
                df['balance'] = 0

            # Create denial flag
            df['is_denied'] = ((df['payment_amount'] == 0) & (df['balance'] > 0)).astype(int)

            # Create total_charge column
            df['total_charge'] = df['payment_amount'] + df['balance']

            # Fill missing values in text columns
            text_columns = ['cpt_code', 'insurance_company', 'physician_name', 'denial_reason']
            for col in text_columns:
                if col in df.columns:
                    df[col] = df[col].fillna('Unknown').astype(str)

            self.data = df
            return True, f"Data loaded successfully. Shape: {df.shape}, Denials found: {df['is_denied'].sum()}"

        except Exception as e:
            return False, f"Error loading data: {str(e)}"

    def analyze_denials(self):
        """Comprehensive denial analysis"""
        if self.data is None:
            return {"error": "No data loaded"}

        results = {}

        # 1. Top denied CPT codes
        denied_claims = self.data[self.data['is_denied'] == 1]
        cpt_denials = denied_claims['cpt_code'].value_counts()
        cpt_denial_rates = self.data.groupby('cpt_code').agg({
            'is_denied': ['sum', 'count', 'mean']
        }).round(3)
        cpt_denial_rates.columns = ['denials', 'total_claims', 'denial_rate']

        results['top_denied_cpts'] = {
            'by_volume': cpt_denials.head(10).to_dict(),
            'by_rate': cpt_denial_rates.sort_values('denial_rate', ascending=False).head(10).to_dict('index')
        }

        # 2. Payer analysis
        payer_analysis = self.data.groupby('insurance_company').agg({
            'is_denied': ['sum', 'count', 'mean'],
            'balance': 'sum',
            'payment_amount': 'sum'
        }).round(2)
        payer_analysis.columns = ['denials', 'total_claims', 'denial_rate', 'total_balance', 'total_payments']
        payer_analysis['lost_revenue'] = payer_analysis['total_balance']

        results['payer_analysis'] = payer_analysis.sort_values('denial_rate', ascending=False).to_dict('index')

        # 3. Provider analysis
        provider_analysis = self.data.groupby('physician_name').agg({
            'is_denied': ['sum', 'count', 'mean'],
            'balance': 'sum'
        }).round(2)
        provider_analysis.columns = ['denials', 'total_claims', 'denial_rate', 'total_balance']

        results['provider_analysis'] = provider_analysis.sort_values('denial_rate', ascending=False).to_dict('index')

        # 4. Denial reason analysis
        if 'denial_reason' in self.data.columns:
            denial_reasons = denied_claims['denial_reason'].value_counts()
            results['denial_reasons'] = denial_reasons.to_dict()

            # Pattern analysis
            self._analyze_denial_patterns(denied_claims)
            results['denial_patterns'] = self.denial_patterns

        # 5. Financial impact
        total_denied_amount = denied_claims['balance'].sum()
        total_revenue = self.data['total_charge'].sum()
        denial_rate = self.data['is_denied'].mean()

        results['financial_impact'] = {
            'total_denied_amount': float(total_denied_amount),
            'total_revenue': float(total_revenue),
            'overall_denial_rate': float(denial_rate),
            'revenue_at_risk_percentage': float((total_denied_amount / total_revenue) * 100) if total_revenue > 0 else 0
        }

        # 6. Recommendations
        results['recommendations'] = self._generate_recommendations()

        return results

    def _analyze_denial_patterns(self, denied_claims):
        """Analyze patterns in denial reasons"""
        if 'denial_reason' not in denied_claims.columns:
            return

        patterns = {
            'documentation_issues': ['missing information', 'documentation', 'records'],
            'authorization_issues': ['authorization', 'referral', 'approval'],
            'coding_issues': ['invalid code', 'unbundling', 'modifier'],
            'eligibility_issues': ['not eligible', 'coverage', 'benefits'],
            'fee_schedule_issues': ['fee schedule', 'exceeds', 'allowable']
        }

        for pattern_name, keywords in patterns.items():
            count = 0
            for reason in denied_claims['denial_reason'].dropna():
                if any(keyword.lower() in str(reason).lower() for keyword in keywords):
                    count += 1
            self.denial_patterns[pattern_name] = count

    def _generate_recommendations(self):
        """Generate actionable recommendations based on analysis"""
        recommendations = []

        if self.data is None:
            return recommendations

        # High denial rate CPTs
        denied_cpts = self.data[self.data['is_denied'] == 1]['cpt_code'].value_counts()
        if len(denied_cpts) > 0:
            top_denied_cpt = denied_cpts.index[0]
            recommendations.append({
                'category': 'High-Risk CPT Codes',
                'issue': f"CPT {top_denied_cpt} has high denial volume",
                'recommendation': f"Review documentation requirements and payer policies for CPT {top_denied_cpt}. Consider staff training on proper coding.",
                'priority': 'High'
            })

        # Payer-specific issues
        payer_denial_rates = self.data.groupby('insurance_company')['is_denied'].mean()
        high_denial_payers = payer_denial_rates[payer_denial_rates > 0.3]

        for payer in high_denial_payers.index[:3]:
            recommendations.append({
                'category': 'Payer Relations',
                'issue': f"{payer} has high denial rate ({high_denial_payers[payer]:.1%})",
                'recommendation': f"Schedule payer education session with {payer}. Review their specific requirements and LCD policies.",
                'priority': 'Medium'
            })

        # Common denial patterns
        if hasattr(self, 'denial_patterns'):
            if self.denial_patterns.get('documentation_issues', 0) > 5:
                recommendations.append({
                    'category': 'Documentation',
                    'issue': "High number of documentation-related denials",
                    'recommendation': "Implement documentation audit process. Train providers on complete documentation requirements.",
                    'priority': 'High'
                })

            if self.denial_patterns.get('fee_schedule_issues', 0) > 3:
                recommendations.append({
                    'category': 'Fee Schedule',
                    'issue': "Multiple fee schedule related denials",
                    'recommendation': "Update fee schedules and verify contracted rates with payers. Consider fee schedule negotiation.",
                    'priority': 'Medium'
                })

        return recommendations

    def train_prediction_model(self):
        """Train ML model to predict denial likelihood"""
        if self.data is None:
            return False, "No data available"

        try:
            # Prepare features
            features = ['cpt_code', 'insurance_company', 'physician_name']
            available_features = [f for f in features if f in self.data.columns]

            if len(available_features) == 0:
                return False, "No suitable features for ML model"

            # Encode categorical variables
            X = self.data[available_features].copy()
            for col in available_features:
                le = LabelEncoder()
                X[col] = le.fit_transform(X[col].astype(str))
                self.label_encoders[col] = le

            y = self.data['is_denied']

            # Split data
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

            # Train model
            self.model = RandomForestClassifier(n_estimators=100, random_state=42)
            self.model.fit(X_train, y_train)

            # Get feature importance
            feature_importance = dict(zip(available_features, self.model.feature_importances_))
            # Calculate metrics
            y_pred = self.model.predict(X_test)
            accuracy = accuracy_score(y_test, y_pred)
            return True, {
                'model_trained': True,
                'feature_importance': feature_importance,
                'features_used': available_features
            },{
                "model_name": "RandomForestClassifier",
                "n_estimators": self.model.n_estimators,
                "random_state": self.model.random_state,
                "accuracy": round(accuracy, 4),
                "criterion": self.model.criterion,
                "max_depth": self.model.max_depth
            }

        except Exception as e:
            return False, f"Error training model: {str(e)}"


# Initialize analyzer
analyzer = MedicalBillingAnalyzer()


@app.route('/')
def home():
    return "Medical Billing Analysis API is running!"


@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file upload and analysis with improved error handling"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        # Check file extension
        allowed_extensions = {'.csv', '.xlsx', '.xls'}
        file_ext = '.' + file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''

        if file_ext not in allowed_extensions:
            return jsonify({'error': f'Unsupported file type. Please upload CSV or Excel files. Got: {file_ext}'}), 400

        # Load data
        file_content = file.read()

        if len(file_content) == 0:
            return jsonify({'error': 'Uploaded file is empty'}), 400

        success, message = analyzer.load_data(file_content)

        if not success:
            return jsonify({'error': message}), 400

        # Perform analysis
        analysis_results = analyzer.analyze_denials()

        if 'error' in analysis_results:
            return jsonify({'error': analysis_results['error']}), 500

        # Train ML model
        model_success, model_info, training_info = analyzer.train_prediction_model()
        if model_success:
            analysis_results['ml_model'] = model_info
            analysis_results['training_info'] = training_info
        else:
            analysis_results['ml_model'] = {'error': model_info}

        # Add data summary
        analysis_results['data_summary'] = {
            'total_records': len(analyzer.data),
            'total_denials': int(analyzer.data['is_denied'].sum()),
            'columns_found': list(analyzer.data.columns),
            'load_message': message
        }

        return jsonify(analysis_results)

    except Exception as e:
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

@app.route('/predict', methods=['POST'])
def predict_denial():
    """Predict denial likelihood for new claims"""
    try:
        data = request.get_json()

        if analyzer.model is None:
            return jsonify({'error': 'Model not trained yet'}), 400

        # Prepare prediction data
        pred_data = []
        for feature in analyzer.label_encoders.keys():
            if feature in data:
                # Transform using existing label encoder
                try:
                    encoded_value = analyzer.label_encoders[feature].transform([data[feature]])[0]
                    pred_data.append(encoded_value)
                except ValueError:
                    # Handle unseen labels
                    pred_data.append(0)
            else:
                pred_data.append(0)

        # Make prediction
        prediction_proba = analyzer.model.predict_proba([pred_data])[0]
        denial_probability = prediction_proba[1] if len(prediction_proba) > 1 else 0

        return jsonify({
            'denial_probability': float(denial_probability),
            'risk_level': 'High' if denial_probability > 0.7 else 'Medium' if denial_probability > 0.3 else 'Low'
        })

    except Exception as e:
        return jsonify({'error': f'Prediction failed: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)