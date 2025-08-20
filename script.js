// --- Constants: Fill these for Ubidots ---
const UBIDOTS_TOKEN = 'BBUS-nOhC82GcwnmOdWfjflv1823qctxy97';
const DEVICE_LABEL = 'esp32';
const VARIABLE_LABEL = 'sensor'; 

const UBIDOTS_URL = `https://industrial.api.ubidots.com/api/v1.6/devices/${DEVICE_LABEL}/${VARIABLE_LABEL}/values`;

// --- Globals ---
let patientData = null;
let ecgChart = null;
let ecgData = [];
let timeData = [];
let rrIntervals = [];
let ecgPollingInterval = null;
let lastFetchTime = 0;

// --- ECG Chart Setup ---
function setupECGChart() {
    const ctx = document.getElementById('ecg-chart').getContext('2d');
    ecgChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeData,
            datasets: [{
                label: 'ECG mV',
                data: ecgData,
                borderColor: '#0ca4a5',
                backgroundColor: 'rgba(12,164,165,0.10)',
                tension: 0.2,
                pointRadius: 0,
                borderWidth: 2,
            }]
        },
        options: {
            animation: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    min: -2,
                    max: 2,
                    title: { display: true, text: 'mV' }
                }
            }
        }
    });
}

// --- UI Handlers ---
document.getElementById('patient-form').addEventListener('submit', function(e){
    e.preventDefault();
    const fd = new FormData(e.target);
    patientData = {
        name: fd.get('name'),
        age: fd.get('age'),
        gender: fd.get('gender'),
        patientId: fd.get('patientId'),
    };
    showDashboard();
});

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

// --- Flow Diagram Highlight ---
function highlightFlowStep(step) {
    for (let i = 1; i <= 6; ++i) {
        document.getElementById(`step-${i}`).classList.remove('active');
    }
    document.getElementById(`step-${step}`).classList.add('active');
    // Remove highlight after 1s
    setTimeout(() => {
        document.getElementById(`step-${step}`).classList.remove('active');
    }, 1000);
}

// --- ECG Data Polling ---
function startEcgPolling() {
    ecgPollingInterval = setInterval(fetchEcgData, 500);
}

async function fetchEcgData() {
    highlightFlowStep(1); // ECG Data Stream
    try {
        const res = await fetch(UBIDOTS_URL, {
            headers: { 'X-Auth-Token': UBIDOTS_TOKEN }
        });
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        // Ubidots returns "results": [{value, timestamp}, ...]
        processEcgData(data.results);
    } catch (err) {
        console.error('ECG fetch error:', err);
    }
}

function processEcgData(results) {
    if (!results || results.length < 1) return;
    highlightFlowStep(2); // Preprocessing
    // Only new points since last fetch
    let newPoints = results.filter(d => d.timestamp > lastFetchTime);
    if (newPoints.length === 0) return;
    lastFetchTime = newPoints[newPoints.length-1].timestamp;

    // Sample: limit to 1000 points for chart
    newPoints.forEach(pt => {
        // Preprocessing: simple normalization
        let value = pt.value; // Can add filtering here
        let timeLabel = new Date(pt.timestamp).toLocaleTimeString().slice(0,8);
        ecgData.push(value);
        timeData.push(timeLabel);
        if (ecgData.length > 1000) {
            ecgData.shift(); timeData.shift();
        }
    });

    ecgChart.data.labels = timeData;
    ecgChart.data.datasets[0].data = ecgData;
    ecgChart.update('none');

    highlightFlowStep(3); // Pan-Tompkins Algorithm
    runPanTompkins(ecgData);

    highlightFlowStep(4); // Post-Processing
    // (Visual update only)
}

// --- Pan-Tompkins Algorithm (simplified) ---
function runPanTompkins(ecg) {
    // R peak detection: find local max above threshold
    let threshold = 0.7; // simple, tune as needed
    let peaks = [];
    for (let i = 1; i < ecg.length-1; i++) {
        if (ecg[i] > threshold && ecg[i] > ecg[i-1] && ecg[i] > ecg[i+1]) {
            // Avoid double-counting, check 200ms separation (assume 250Hz, 50 samples)
            if (peaks.length === 0 || (i - peaks[peaks.length-1]) > 50)
                peaks.push(i);
        }
    }
    // RR intervals (ms)
    let rr = [];
    for (let i = 1; i < peaks.length; i++) {
        let interval = (peaks[i] - peaks[i-1]) * 4; // If 250Hz, 4ms per sample
        rr.push(interval);
    }
    rrIntervals = rr;

    // Heart Rate
    let hr = rr.length > 0 ? Math.round(60000 / (average(rr) || 800)) : '--';
    document.getElementById('hr-value').textContent = hr;
    document.getElementById('rr-value').textContent = rr.length > 0 ? Math.round(average(rr)) : '--';
    document.getElementById('variability-value').textContent = rr.length > 0 ? stddev(rr).toFixed(1) : '--';

    // Flags/analysis
    highlightFlowStep(5); // Logic-Based Analysis
    let flags = [];
    if (hr !== '--') {
        if (hr > 100) flags.push('Tachycardia');
        if (hr < 60) flags.push('Bradycardia');
    }
    if (stddev(rr) > 80) flags.push('Arrhythmia');
    document.getElementById('flags-value').textContent = flags.length ? flags.join(', ') : 'None';

    // Summary
    highlightFlowStep(6); // Summary
    let summary = 'Normal Sinus Rhythm';
    if (flags.includes('Arrhythmia')) summary = 'Possible Arrhythmia Detected';
    else if (flags.includes('Tachycardia')) summary = 'Tachycardia Detected';
    else if (flags.includes('Bradycardia')) summary = 'Bradycardia Detected';
    document.getElementById('analysis-summary').textContent = summary;
}

// --- Math Helpers ---
function average(arr) {
    return arr.reduce((a,b)=>a+b,0) / (arr.length || 1);
}
function stddev(arr) {
    let avg = average(arr);
    return Math.sqrt(arr.reduce((sum, v) => sum + (v-avg)**2, 0) / (arr.length || 1));
}

// --- Report Export ---
document.getElementById('download-report').addEventListener('click', function(){
    exportReportPDF();
});

function exportReportPDF() {
    const { jsPDF } = window.jspdf;
    let doc = new jsPDF();

    doc.setFont('helvetica');
    doc.setFontSize(18);
    doc.setTextColor(22, 66, 91);
    doc.text('Virtual IoT-Based ECG System Report', 15, 20);

    doc.setFontSize(12);
    doc.text(`Patient Name: ${patientData.name}`, 15, 32);
    doc.text(`Age: ${patientData.age}`, 15, 39);
    doc.text(`Gender: ${patientData.gender}`, 15, 46);
    doc.text(`Patient ID: ${patientData.patientId}`, 15, 53);

    doc.text('Analysis Results:', 15, 65);
    doc.text(`Heart Rate: ${document.getElementById('hr-value').textContent} bpm`, 15, 72);
    doc.text(`RR Interval: ${document.getElementById('rr-value').textContent} ms`, 15, 79);
    doc.text(`Variability: ${document.getElementById('variability-value').textContent}`, 15, 86);
    doc.text(`Flags: ${document.getElementById('flags-value').textContent}`, 15, 93);
    doc.text(`Summary: ${document.getElementById('analysis-summary').textContent}`, 15, 100);

    // ECG Chart snapshot
    const canvas = document.getElementById('ecg-chart');
    const imgData = canvas.toDataURL('image/jpeg', 1.0);
    doc.text('ECG Waveform:', 15, 112);
    doc.addImage(imgData, 'JPEG', 15, 117, 180, 50);

    doc.save(`ECG_Report_${patientData.patientId}.pdf`);
}