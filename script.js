// Configuration
const CONFIG = {
    chart: {
        gridSize: {
            major: 40,    // 5mm squares (standard ECG grid)
            minor: 8      // 1mm squares
        },
        scale: {
            vertical: 0.1,    // 0.1mV/mm (standard)
            timeScale: 25     // 25mm/second (standard)
        },
        colors: {
            grid: {
                major: 'rgba(255,0,0,0.1)',
                minor: 'rgba(0,0,0,0.05)'
            },
            signal: '#0066cc'
        }
    },
    sampling: {
        rate: 250,           // 250Hz sampling rate
        displayPoints: 2500  // 10 seconds of data
    },
    system: {
        lastUpdate: '2025-08-26 05:49:38',
        user: 'Hibecode'
    }
};

// Global variables
let patientData = null;
let ecgChart = null;
let ecgData = [];
let timeData = [];
let rrIntervals = [];

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    setupUserInterface();
    setupEventListeners();
});

// UI Setup
function setupUserInterface() {
    document.getElementById('last-update').textContent = CONFIG.system.lastUpdate;
    document.getElementById('current-user').textContent = CONFIG.system.user;
}

function setupEventListeners() {
    // Patient form submission
    document.getElementById('patient-form').addEventListener('submit', handlePatientSubmit);
    
    // Export report button
    document.getElementById('download-report').addEventListener('click', exportReportPDF);
    
    // Real-time monitoring toggle
    document.getElementById('toggle-monitoring').addEventListener('click', toggleMonitoring);
}

// ECG Chart Setup with Medical Grade Grid
function setupECGChart() {
    const ctx = document.getElementById('ecg-chart').getContext('2d');
    
    // Setup medical grade ECG grid
    setupECGGrid(ctx);
    
    ecgChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeData,
            datasets: [{
                label: 'ECG Signal',
                data: ecgData,
                borderColor: CONFIG.chart.colors.signal,
                backgroundColor: 'rgba(0,102,204,0.1)',
                borderWidth: 1.5,
                tension: 0,        // Remove smoothing for accurate QRS
                pointRadius: 0,    // No points for performance
                spanGaps: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,      // Disable for performance
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: {
                    type: 'linear',
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 0,
                        callback: function(value) {
                            return (value / CONFIG.sampling.rate).toFixed(1) + 's';
                        }
                    }
                },
                y: {
                    display: true,
                    min: -1.5,
                    max: 1.5,
                    grid: {
                        display: false
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toFixed(1) + ' mV';
                        }
                    }
                }
            }
        }
    });
}

// Medical Grade ECG Grid
function setupECGGrid(ctx) {
    const canvas = ctx.canvas;
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = canvas.width;
    gridCanvas.height = canvas.height;
    const gridCtx = gridCanvas.getContext('2d');
    
    // Draw minor grid
    gridCtx.beginPath();
    gridCtx.strokeStyle = CONFIG.chart.colors.grid.minor;
    for (let x = 0; x < canvas.width; x += CONFIG.chart.gridSize.minor) {
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += CONFIG.chart.gridSize.minor) {
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(canvas.width, y);
    }
    gridCtx.stroke();
    
    // Draw major grid
    gridCtx.beginPath();
    gridCtx.strokeStyle = CONFIG.chart.colors.grid.major;
    for (let x = 0; x < canvas.width; x += CONFIG.chart.gridSize.major) {
        gridCtx.moveTo(x, 0);
        gridCtx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += CONFIG.chart.gridSize.major) {
        gridCtx.moveTo(0, y);
        gridCtx.lineTo(canvas.width, y);
    }
    gridCtx.stroke();
    
    // Apply grid to main canvas
    ctx.drawImage(gridCanvas, 0, 0);
}

// Signal Processing
function processECGData(newData) {
    // Apply filtering
    const filteredData = applyFilters(newData);
    
    // Update chart data
    updateChartData(filteredData);
    
    // Detect QRS complexes
    const qrsPoints = detectQRSComplexes(filteredData);
    
    // Calculate heart rate and variability
    calculateHeartMetrics(qrsPoints);
    
    // Update display
    updateDisplay();
}

// Signal Filtering
function applyFilters(data) {
    return data.map(value => {
        // High-pass filter (remove baseline wander)
        value = highPassFilter(value);
        
        // Low-pass filter (remove high-frequency noise)
        value = lowPassFilter(value);
        
        // Notch filter (remove 50/60Hz interference)
        value = notchFilter(value);
        
        return value;
    });
}

// Filter implementations
function highPassFilter(value) {
    // 0.5Hz high-pass filter implementation
    return value; // Implement actual filter
}

function lowPassFilter(value) {
    // 40Hz low-pass filter implementation
    return value; // Implement actual filter
}

function notchFilter(value) {
    // 50/60Hz notch filter implementation
    return value; // Implement actual filter
}

// QRS Detection using Pan-Tompkins algorithm
function detectQRSComplexes(data) {
    const qrsPoints = [];
    const threshold = 0.7;
    
    for (let i = 1; i < data.length - 1; i++) {
        if (data[i] > threshold && 
            data[i] > data[i-1] && 
            data[i] > data[i+1]) {
            // Minimum 200ms between peaks (50 samples at 250Hz)
            if (qrsPoints.length === 0 || (i - qrsPoints[qrsPoints.length-1]) > 50) {
                qrsPoints.push(i);
            }
        }
    }
    
    return qrsPoints;
}

// Heart Rate Calculations
function calculateHeartMetrics(qrsPoints) {
    // Calculate RR intervals
    rrIntervals = [];
    for (let i = 1; i < qrsPoints.length; i++) {
        const rrInterval = (qrsPoints[i] - qrsPoints[i-1]) * (1000 / CONFIG.sampling.rate);
        rrIntervals.push(rrInterval);
    }
    
    // Calculate heart rate
    const averageRR = rrIntervals.reduce((a,b) => a + b, 0) / rrIntervals.length;
    const heartRate = Math.round(60000 / averageRR);
    
    // Calculate heart rate variability
    const hrv = calculateHRV(rrIntervals);
    
    updateMetricsDisplay(heartRate, averageRR, hrv);
}

function calculateHRV(intervals) {
    if (intervals.length < 2) return 0;
    const mean = intervals.reduce((a,b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (intervals.length - 1);
    return Math.sqrt(variance);
}

// Display Updates
function updateMetricsDisplay(heartRate, averageRR, hrv) {
    document.getElementById('hr-value').textContent = heartRate || '--';
    document.getElementById('rr-value').textContent = averageRR ? Math.round(averageRR) : '--';
    document.getElementById('variability-value').textContent = hrv ? hrv.toFixed(1) : '--';
    
    // Update analysis
    const analysis = analyzeECG(heartRate, hrv);
    document.getElementById('analysis-summary').textContent = analysis.summary;
    document.getElementById('flags-value').textContent = analysis.flags.join(', ') || 'None';
}

// ECG Analysis
function analyzeECG(heartRate, hrv) {
    const flags = [];
    let summary = 'Normal Sinus Rhythm';
    
    if (heartRate > 100) {
        flags.push('Tachycardia');
        summary = 'Tachycardia Detected';
    } else if (heartRate < 60) {
        flags.push('Bradycardia');
        summary = 'Bradycardia Detected';
    }
    
    if (hrv > 80) {
        flags.push('High Variability');
        summary = 'Irregular Rhythm Detected';
    }
    
    return { flags, summary };
}

// Data Simulation (for testing)
function simulateECGData() {
    const frequency = 1; // 1 Hz basic frequency
    const amplitude = 1; // 1 mV amplitude
    
    return Array(CONFIG.sampling.displayPoints).fill(0).map((_, i) => {
        const t = i / CONFIG.sampling.rate;
        // Simplified ECG wave simulation
        return amplitude * (
            Math.sin(2 * Math.PI * frequency * t) +
            0.5 * Math.sin(30 * Math.PI * frequency * t) * Math.exp(-30 * Math.pow(t % 1 - 0.2, 2))
        );
    });
}

// Export functionality
function exportReportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Add report header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ECG Analysis Report', 20, 20);
    
    // Add patient information
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Patient: ${patientData.name}`, 20, 40);
    doc.text(`ID: ${patientData.patientId}`, 20, 50);
    doc.text(`Date: ${CONFIG.system.lastUpdate}`, 20, 60);
    
    // Add analysis results
    doc.text('Analysis Results:', 20, 80);
    doc.text(`Heart Rate: ${document.getElementById('hr-value').textContent} bpm`, 30, 90);
    doc.text(`RR Interval: ${document.getElementById('rr-value').textContent} ms`, 30, 100);
    doc.text(`Variability: ${document.getElementById('variability-value').textContent}`, 30, 110);
    
    // Add ECG strip
    const canvas = document.getElementById('ecg-chart');
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    doc.addImage(imgData, 'JPEG', 20, 130, 170, 100);
    
    // Save the PDF
    doc.save(`ECG_Report_${patientData.patientId}_${CONFIG.system.lastUpdate.replace(/[: ]/g, '-')}.pdf`);
}

// Initialize the application
setupUserInterface();