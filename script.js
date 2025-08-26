// --- System Configuration ---
const CONFIG = {
    system: {
        version: '2.0.0',
        lastUpdate: '2025-08-26 06:35:17',
        currentUser: 'Hibecode'
    },
    ubidots: {
        baseUrl: 'https://industrial.ubidots.com/api/v1.6',
        device: 'esp32',
        variable: 'sensor',
        token: 'BBUS-ZGjQBOrb7CD0wdMYkDxpoS5RtnAPdv',
        endpoint: '/lv'
    },
    sampling: {
        rate: 250,               // 250Hz
        displayPoints: 2500,     // 10 seconds of data
        qrsWindowSize: 250       // 1 second window for QRS detection
    },
    chart: {
        grid: {
            major: {
                size: 40,        // 5mm at 200 DPI
                color: 'rgba(255,0,0,0.1)'
            },
            minor: {
                size: 8,         // 1mm at 200 DPI
                color: 'rgba(0,0,0,0.05)'
            }
        },
        scale: {
            vertical: 0.1,       // 0.1mV/mm (standard)
            horizontal: 25,      // 25mm/second (standard)
            timeScale: 0.04      // seconds per mm
        },
        colors: {
            signal: '#0066cc',
            grid: {
                major: 'rgba(255,0,0,0.1)',
                minor: 'rgba(0,0,0,0.05)'
            }
        }
    },
    clinical: {
        heartRate: {
            bradycardia: 60,
            normal: {min: 60, max: 100},
            tachycardia: 100
        },
        qrs: {
            normal: {min: 0.08, max: 0.12}  // seconds
        }
    }
};

// --- Global Variables ---
let patientData = null;
let ecgChart = null;
let ecgData = [];
let timeData = [];
let rrIntervals = [];
let pollingInterval = null;
let lastProcessedTimestamp = 0;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', function() {
    setupUserInterface();
    setupEventListeners();
    setupMonitoringControls();
    updateSystemInfo();
});

function setupUserInterface() {
    // Initialize patient form section
    document.getElementById('patient-form-section').style.display = '';
    document.getElementById('dashboard-section').style.display = 'none';
    
    // Initialize system info
    document.getElementById('system-time').textContent = CONFIG.system.lastUpdate;
    document.getElementById('system-user').textContent = CONFIG.system.currentUser;
    
    // Initialize connection status
    updateConnectionStatus(false);
}

function setupEventListeners() {
    // Patient form submission
    document.getElementById('patient-form').addEventListener('submit', function(e) {
        e.preventDefault();
        const fd = new FormData(e.target);
        patientData = {
            name: fd.get('name'),
            age: fd.get('age'),
            gender: fd.get('gender'),
            patientId: fd.get('patientId')
        };
        showDashboard();
    });

    // Report export
    document.getElementById('download-report').addEventListener('click', exportReportPDF);
}

function setupMonitoringControls() {
    const startButton = document.getElementById('start-monitoring');
    const stopButton = document.getElementById('stop-monitoring');
    
    startButton.addEventListener('click', () => {
        startEcgPolling();
        startButton.disabled = true;
        stopButton.disabled = false;
    });
    
    stopButton.addEventListener('click', () => {
        stopEcgPolling();
        startButton.disabled = false;
        stopButton.disabled = true;
    });
}

// --- Data Acquisition ---
async function fetchLatestECGData() {
    highlightFlowStep(1); // ECG Data Stream
    const url = `${CONFIG.ubidots.baseUrl}/devices/${CONFIG.ubidots.device}/${CONFIG.ubidots.variable}/lv`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'X-Auth-Token': CONFIG.ubidots.token,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        
        if (data && data.value !== undefined) {
            processNewDataPoint(data.value, new Date(data.timestamp));
            updateConnectionStatus(true);
        }
    } catch (error) {
        console.error('ECG fetch error:', error);
        handleDataError(error);
    }
}

// --- Signal Processing ---
function processNewDataPoint(value, timestamp) {
    if (timestamp <= lastProcessedTimestamp) return;
    lastProcessedTimestamp = timestamp;

    // Apply filters
    const filteredValue = applyFilters([value])[0];
    
    // Update data arrays
    ecgData.push(filteredValue);
    timeData.push(formatTimestamp(timestamp));

    // Maintain fixed window
    if (ecgData.length > CONFIG.sampling.displayPoints) {
        ecgData.shift();
        timeData.shift();
    }

    // Update visualizations
    updateChartWithNewPoint(filteredValue);
    
    // QRS detection
    if (ecgData.length >= CONFIG.sampling.qrsWindowSize) {
        detectQRSComplexes(ecgData.slice(-CONFIG.sampling.qrsWindowSize));
    }
}

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

function highPassFilter(value) {
    // Implement 0.5Hz high-pass filter
    return value;
}

function lowPassFilter(value) {
    // Implement 40Hz low-pass filter
    return value;
}

function notchFilter(value) {
    // Implement 50/60Hz notch filter
    return value;
}

// --- QRS Detection ---
function detectQRSComplexes(data) {
    const threshold = 0.7;
    const qrsPoints = [];
    
    for (let i = 1; i < data.length - 1; i++) {
        if (data[i] > threshold && 
            data[i] > data[i-1] && 
            data[i] > data[i+1]) {
            if (qrsPoints.length === 0 || (i - qrsPoints[qrsPoints.length-1]) > 50) {
                qrsPoints.push(i);
            }
        }
    }
    
    calculateHeartMetrics(qrsPoints);
}

// --- Clinical Measurements ---
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
    
    // Calculate HRV
    const hrv = calculateHRV(rrIntervals);
    
    updateMetricsDisplay(heartRate, averageRR, hrv);
}

function calculateHRV(intervals) {
    if (intervals.length < 2) return 0;
    const mean = intervals.reduce((a,b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, value) => {
        return sum + Math.pow(value - mean, 2);
    }, 0) / (intervals.length - 1);
    return Math.sqrt(variance);
}

// --- Visualization ---
function setupECGChart() {
    const ctx = document.getElementById('ecg-chart').getContext('2d');
    
    // Setup medical grade grid
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
                tension: 0,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'category',
                    display: true,
                    grid: { display: false },
                    ticks: {
                        maxRotation: 0,
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    min: -1.5,
                    max: 1.5,
                    grid: { display: false }
                }
            }
        }
    });
}

function setupECGGrid(ctx) {
    const canvas = ctx.canvas;
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = canvas.width;
    gridCanvas.height = canvas.height;
    const gridCtx = gridCanvas.getContext('2d');
    
    // Draw minor grid
    drawGrid(gridCtx, CONFIG.chart.grid.minor.size, CONFIG.chart.grid.minor.color);
    
    // Draw major grid
    drawGrid(gridCtx, CONFIG.chart.grid.major.size, CONFIG.chart.grid.major.color);
    
    // Apply grid to main canvas
    ctx.drawImage(gridCanvas, 0, 0);
}

function drawGrid(ctx, spacing, color) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    
    ctx.beginPath();
    ctx.strokeStyle = color;
    
    // Vertical lines
    for (let x = 0; x <= width; x += spacing) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    
    // Horizontal lines
    for (let y = 0; y <= height; y += spacing) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    
    ctx.stroke();
}

// --- UI Updates ---
function updateChartWithNewPoint(value) {
    if (!ecgChart) return;
    
    ecgChart.data.labels = timeData;
    ecgChart.data.datasets[0].data = ecgData;
    ecgChart.update('none');
}

function updateMetricsDisplay(heartRate, averageRR, hrv) {
    document.getElementById('hr-value').textContent = heartRate || '--';
    document.getElementById('rr-value').textContent = averageRR ? Math.round(averageRR) : '--';
    document.getElementById('variability-value').textContent = hrv ? hrv.toFixed(1) : '--';
    
    const analysis = analyzeECG(heartRate, hrv);
    document.getElementById('analysis-summary').textContent = analysis.summary;
    document.getElementById('flags-value').textContent = analysis.flags.join(', ') || 'None';
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    statusElement.className = connected ? 'connected' : 'disconnected';
    statusElement.textContent = connected ? 'Connected' : 'Disconnected';
}

function updateSystemInfo() {
    document.getElementById('system-time').textContent = CONFIG.system.lastUpdate;
    document.getElementById('system-user').textContent = CONFIG.system.currentUser;
}

// --- Clinical Analysis ---
function analyzeECG(heartRate, hrv) {
    const flags = [];
    let summary = 'Normal Sinus Rhythm';
    
    if (heartRate > CONFIG.clinical.heartRate.tachycardia) {
        flags.push('Tachycardia');
        summary = 'Tachycardia Detected';
    } else if (heartRate < CONFIG.clinical.heartRate.bradycardia) {
        flags.push('Bradycardia');
        summary = 'Bradycardia Detected';
    }
    
    if (hrv > 80) {
        flags.push('High Variability');
        summary = 'Irregular Rhythm Detected';
    }
    
    return { flags, summary };
}

// --- Control Flow ---
function startEcgPolling() {
    fetchLatestECGData();
    pollingInterval = setInterval(fetchLatestECGData, 100);
}

function stopEcgPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

function showDashboard() {
    document.getElementById('patient-form-section').style.display = 'none';
    document.getElementById('dashboard-section').style.display = '';
    document.getElementById('patient-info').innerHTML = `
        <strong>Name:</strong> ${patientData.name}<br>
        <strong>Age:</strong> ${patientData.age}<br>
        <strong>Gender:</strong> ${patientData.gender}<br>
        <strong>Patient ID:</strong> ${patientData.patientId}
    `;
    setupECGChart();
    startEcgPolling();
    highlightFlowStep(1);
}

// --- Utility Functions ---
function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().slice(11, 19);
}

function handleDataError(error) {
    console.error('Data fetch error:', error);
    document.getElementById('connection-status').classList.add('error');
    document.getElementById('connection-status').textContent = 'Connection Error';
    updateConnectionStatus(false);
}

function highlightFlowStep(step) {
    for (let i = 1; i <= 6; ++i) {
        document.getElementById(`step-${i}`).classList.remove('active');
    }
    document.getElementById(`step-${step}`).classList.add('active');
    setTimeout(() => {
        document.getElementById(`step-${step}`).classList.remove('active');
    }, 1000);
}

// --- Report Generation ---
function exportReportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('ECG Analysis Report', 20, 20);
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${CONFIG.system.lastUpdate}`, 20, 30);
    doc.text(`Patient: ${patientData.name}`, 20, 40);
    doc.text(`ID: ${patientData.patientId}`, 20, 50);
    
    doc.text('Vital Signs:', 20, 70);
    doc.text(`Heart Rate: ${document.getElementById('hr-value').textContent} bpm`, 30, 80);
    doc.text(`RR Interval: ${document.getElementById('rr-value').textContent} ms`, 30, 90);
    doc.text(`Heart Rate Variability: ${document.getElementById('variability-value').textContent}`, 30, 100);
    
    doc.text('Analysis:', 20, 120);
    doc.text(`Flags: ${document.getElementById('flags-value').textContent}`, 30, 130);
    doc.text(`Summary: ${document.getElementById('analysis-summary').textContent}`, 30, 140);
    
    // Add ECG strip
    const canvas = document.getElementById('ecg-chart');
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    doc.addImage(imgData, 'JPEG', 20, 160, 170, 80);
    
    doc.save(`ECG_Report_${patientData.patientId}_${CONFIG.system.lastUpdate.replace(/[: ]/g, '-')}.pdf`);
}