import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer } from 'recharts';
import { Upload, FileText, TrendingUp, AlertTriangle, DollarSign, Activity, Users, Stethoscope } from 'lucide-react';

const MedicalBillingDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [predictionData, setPredictionData] = useState({
    cpt_code: '',
    insurance_company: '',
    physician_name: ''
  });
  const [prediction, setPrediction] = useState(null);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [trainingInfo, setTrainingInfo] = useState(null);
  const [trainingInfoLoading, setTrainingInfoLoading] = useState(false);
  const API_BASE = 'http://localhost:5000';

  const handleFileUpload = async (file) => {
    if (!file) return;

    setLoading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',  
        body: formData
      });
      
      const result = await response.json();
      if (response.ok) {
        setData(result);
      } else {
        setError(result.error || 'Upload failed');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (event) => {
    const file = event.target.files[0];
    handleFileUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileUpload(files[0]);
    }
  };

  const handlePredict = async () => {
    if (!predictionData.cpt_code || !predictionData.insurance_company || !predictionData.physician_name) {
      alert('Please fill all fields for prediction');
      return;
    }

    setPredictionLoading(true);
    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(predictionData)
      });
      
      const result = await response.json();
      if (response.ok) {
        setPrediction(result);
      } else {
        alert(result.error || 'Prediction failed');
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setPredictionLoading(false);
    }
  };

  // Chart data preparation
  const prepareCPTData = () => {
    if (!data?.top_denied_cpts?.by_rate) return [];
    return Object.entries(data.top_denied_cpts.by_rate)
      .map(([cpt, info]) => ({
        cpt,
        denials: info.denials,
        total_claims: info.total_claims,
        denial_rate: (info.denial_rate * 100).toFixed(1)
      }))
      .filter(item => item.total_claims > 0)
      .sort((a, b) => b.denial_rate - a.denial_rate);
  };

  const preparePayerData = () => {
    if (!data?.payer_analysis) return [];
    return Object.entries(data.payer_analysis)
      .map(([payer, info]) => ({
        payer: payer.length > 15 ? payer.substring(0, 15) + '...' : payer,
        full_payer: payer,
        denial_rate: (info.denial_rate * 100).toFixed(1),
        denials: info.denials,
        lost_revenue: info.lost_revenue,
        total_claims: info.total_claims
      }))
      .filter(item => item.total_claims > 0)
      .sort((a, b) => b.denial_rate - a.denial_rate);
  };

  const prepareProviderData = () => {
    if (!data?.provider_analysis) return [];
    return Object.entries(data.provider_analysis)
      .map(([provider, info]) => ({
        provider: provider.length > 12 ? provider.substring(0, 12) + '...' : provider,
        full_provider: provider,
        denial_rate: (info.denial_rate * 100).toFixed(1),
        denials: info.denials,
        total_balance: info.total_balance,
        total_claims: info.total_claims
      }))
      .filter(item => item.total_claims > 0)
      .sort((a, b) => b.denial_rate - a.denial_rate);
  };

  const prepareDenialReasonsData = () => {
    if (!data?.denial_reasons) return [];
    return Object.entries(data.denial_reasons)
      .map(([reason, count]) => ({
        reason: reason.length > 20 ? reason.substring(0, 20) + '...' : reason,
        full_reason: reason,
        count
      }))
      .sort((a, b) => b.count - a.count);
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

  const StatCard = ({ title, value, icon: Icon, color = 'blue', subtitle }) => (
    <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-blue-500">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-blue-600">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <Icon className="h-8 w-8 text-blue-500" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Medical Billing Analysis Dashboard</h1>
          <p className="text-gray-600">Upload your billing data to analyze denials, revenue, and predict claim outcomes</p>
        </div>

        {/* File Upload Section */}
        <div className="bg-white p-6 rounded-lg shadow-md mb-8">
          <div className="flex items-center mb-4">
            <Upload className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-xl font-semibold">Upload Billing Data</h2>
          </div>
          <div 
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleInputChange}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg text-gray-600 mb-2">Click to upload or drag and drop CSV or Excel file</p>
              <p className="text-sm text-gray-500">Supports .csv, .xlsx, .xls formats</p>
            </label>
          </div>
          {loading && <p className="text-blue-600 mt-4">Analyzing data...</p>}
          {error && <p className="text-red-600 mt-4">Error: {error}</p>}
        </div>

        {data && (
          <>
            {/* Summary Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard
                title="Total Claims"
                value={data.data_summary?.total_records || 0}
                icon={FileText}
                color="blue"
              />
              <StatCard
                title="Total Denials"
                value={data.data_summary?.total_denials || 0}
                icon={AlertTriangle}
                color="red"
                subtitle={`${(data.financial_impact?.overall_denial_rate * 100).toFixed(1)}% denial rate`}
              />
              <StatCard
                title="Lost Revenue"
                value={`$${data.financial_impact?.total_denied_amount?.toLocaleString() || 0}`}
                icon={DollarSign}
                color="yellow"
                subtitle={`${data.financial_impact?.revenue_at_risk_percentage?.toFixed(1)}% at risk`}
              />
              <StatCard
                title="Total Revenue"
                value={`$${data.financial_impact?.total_revenue?.toLocaleString() || 0}`}
                icon={TrendingUp}
                color="green"
              />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
              {/* CPT Denials Chart */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Activity className="h-5 w-5 mr-2 text-blue-500" />
                  Denials by CPT Code
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={prepareCPTData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="cpt" />
                    <YAxis />
                    <Tooltip formatter={(value, name) => [
                      name === 'denial_rate' ? `${value}%` : value,
                      name === 'denial_rate' ? 'Denial Rate' : 'Denials'
                    ]} />
                    <Legend />
                    <Bar dataKey="denials" fill="#FF8042" name="Denials" />
                    <Bar dataKey="denial_rate" fill="#8884d8" name="Denial Rate %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Payer Analysis Chart */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Users className="h-5 w-5 mr-2 text-green-500" />
                  Denials by Payer
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={preparePayerData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="payer" />
                    <YAxis />
                    <Tooltip formatter={(value, name) => [
                      name === 'denial_rate' ? `${value}%` : value,
                      name === 'denial_rate' ? 'Denial Rate' : 'Denials'
                    ]} />
                    <Legend />
                    <Bar dataKey="denials" fill="#00C49F" name="Denials" />
                    <Bar dataKey="denial_rate" fill="#FFBB28" name="Denial Rate %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Provider Analysis Chart */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Stethoscope className="h-5 w-5 mr-2 text-purple-500" />
                  Denials by Provider
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={prepareProviderData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="provider" />
                    <YAxis />
                    <Tooltip formatter={(value, name) => [
                      name === 'denial_rate' ? `${value}%` : value,
                      name === 'denial_rate' ? 'Denial Rate' : 'Denials'
                    ]} />
                    <Legend />
                    <Bar dataKey="denials" fill="#8884d8" name="Denials" />
                    <Bar dataKey="denial_rate" fill="#82ca9d" name="Denial Rate %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Denial Reasons Pie Chart */}
              <div className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold mb-4">Denial Reasons Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={prepareDenialReasonsData()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ reason, percent }) => `${reason}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {prepareDenialReasonsData().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Detailed Tables */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
              <h3 className="text-lg font-semibold mb-4">Detailed Analysis Tables</h3>
              
              {/* Payer Analysis Table */}
              <div className="mb-6">
                <h4 className="font-medium mb-2">Payer Performance</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto border-collapse border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border border-gray-300 px-4 py-2 text-left">Payer</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Total Claims</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Denials</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Denial Rate</th>
                        <th className="border border-gray-300 px-4 py-2 text-right">Lost Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preparePayerData().map((row, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-300 px-4 py-2">{row.full_payer}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{row.total_claims}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">{row.denials}</td>
                          <td className="border border-gray-300 px-4 py-2 text-right">
                            <span className={`px-2 py-1 rounded text-sm ${
                              parseFloat(row.denial_rate) > 50 ? 'bg-red-100 text-red-800' :
                              parseFloat(row.denial_rate) > 25 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-green-100 text-green-800'
                            }`}>
                              {row.denial_rate}%
                            </span>
                          </td>
                          <td className="border border-gray-300 px-4 py-2 text-right">${row.lost_revenue?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-white p-6 rounded-lg shadow-md mb-8">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-orange-500" />
                Recommendations
              </h3>
              <div className="space-y-4">
                {data.recommendations?.map((rec, idx) => (
                  <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                    rec.priority === 'High' ? 'border-red-500 bg-red-50' :
                    rec.priority === 'Medium' ? 'border-yellow-500 bg-yellow-50' :
                    'border-green-500 bg-green-50'
                  }`}>
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-gray-900">{rec.category}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rec.priority === 'High' ? 'bg-red-100 text-red-800' :
                        rec.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {rec.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-1"><strong>Issue:</strong> {rec.issue}</p>
                    <p className="text-sm text-gray-700"><strong>Recommendation:</strong> {rec.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Prediction Section */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-blue-500" />
                Predict Claim Denial Risk
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPT Code</label>
                  <input
                    type="text"
                    value={predictionData.cpt_code}
                    onChange={(e) => setPredictionData(prev => ({...prev, cpt_code: e.target.value}))}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., 99213"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Company</label>
                  <input
                    type="text"
                    value={predictionData.insurance_company}
                    onChange={(e) => setPredictionData(prev => ({...prev, insurance_company: e.target.value}))}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Blue Cross"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Physician Name</label>
                  <input
                    type="text"
                    value={predictionData.physician_name}
                    onChange={(e) => setPredictionData(prev => ({...prev, physician_name: e.target.value}))}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Dr. Smith"
                  />
                </div>
              </div>
              <button
                onClick={handlePredict}
                disabled={predictionLoading}
                className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {predictionLoading ? 'Predicting...' : 'Predict Denial Risk'}
              </button>
              
              {prediction && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Prediction Result</h4>
                  <div className="flex items-center space-x-4">
                    <div>
                      <span className="text-sm text-gray-600">Denial Probability: </span>
                      <span className="font-bold text-lg">
                        {(prediction.denial_probability * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        prediction.risk_level === 'High' ? 'bg-red-100 text-red-800' :
                        prediction.risk_level === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {prediction.risk_level} Risk
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MedicalBillingDashboard;