// MNIST MNIST Model Trainer & Predictor
// Using TensorFlow.js

// Global state
let models = {};

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Load models from local storage
    await loadModelsFromStorage();

    // If no models exist, show info message
    if (Object.keys(models).length === 0) {
        showStatus('No models loaded. Train one to get started!', 'info');
    }

    // Load a sample MNIST image for comparison
    await loadSampleMNISTImage();

    // Initialize preview
    updatePreview();
});


// Create MNIST model
function createModel() {
    const model = tf.sequential({
        layers: [
            tf.layers.dense({ inputShape: [28 * 28], units: 128, activation: 'relu' }),
            tf.layers.dropout({ rate: 0.2 }),
            tf.layers.dense({ units: 64, activation: 'relu' }),
            tf.layers.dropout({ rate: 0.2 }),
            tf.layers.dense({ units: 10, activation: 'softmax' })
        ]
    });

    model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });

    return model;
}

// Load MNIST data from local images
async function loadMNISTData(numExamples = 1000) {
    // Load manifest with all available image files
    const manifest = await fetch('./manifest.json').then(r => r.json());

    // Limit number of examples
    const selectedTrainFiles = manifest.train.slice(0, numExamples);
    const selectedTestFiles = manifest.test.slice(0, Math.floor(numExamples * 0.1));

    // Parse filename to get label
    const getLabel = (filename) => {
        const match = filename.match(/_label_(\d+)/);
        return match ? parseInt(match[1]) : 0;
    };

    // Create tf.data dataset from images
    const trainImagePaths = selectedTrainFiles.map(f => `./mnist_images/train/${f}`);
    const trainLabels = selectedTrainFiles.map(getLabel);

    const testImagePaths = selectedTestFiles.map(f => `./mnist_images/test/${f}`);
    const testLabels = selectedTestFiles.map(getLabel);

    // Create train dataset
    const trainDataset = tf.data.generator(async function* () {
        for (let i = 0; i < trainImagePaths.length; i++) {
            const img = new Image();
            img.src = trainImagePaths[i];
            await new Promise(resolve => img.onload = resolve);

            const canvas = document.createElement('canvas');
            canvas.width = 28;
            canvas.height = 28;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 28, 28);

            const tensor = tf.browser.fromPixels(canvas, 1).asType('float32').div(255);
            const label = tf.oneHot(trainLabels[i], 10);

            yield { xs: tensor, ys: label };
        }
    });

    // Create test dataset
    const testDataset = tf.data.generator(async function* () {
        for (let i = 0; i < testImagePaths.length; i++) {
            const img = new Image();
            img.src = testImagePaths[i];
            await new Promise(resolve => img.onload = resolve);

            const canvas = document.createElement('canvas');
            canvas.width = 28;
            canvas.height = 28;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 28, 28);

            const tensor = tf.browser.fromPixels(canvas, 1).asType('float32').div(255);
            const label = tf.oneHot(testLabels[i], 10);

            yield { xs: tensor, ys: label };
        }
    });

    return { data: trainDataset, testData: testDataset };
}

// Train model
async function trainModel() {
    const epochs = parseInt(document.getElementById('epochs').value);
    const batchSize = parseInt(document.getElementById('batchSize').value);
    const learningRate = parseFloat(document.getElementById('learningRate').value);
    const modelName = `Model ${new Date().toLocaleTimeString()}`;

    await trainAndSaveModel(modelName, epochs, batchSize, learningRate);
}

async function trainAndSaveModel(modelName, epochs, batchSize, learningRate) {
    try {
        // Disable training button
        document.getElementById('trainBtn').disabled = true;
        document.getElementById('progressBar').style.display = 'block';

        // Load MNIST data
        showStatus('Loading MNIST dataset...', 'info');
        const { data, testData } = await loadMNISTData();

        // Create model
        const model = createModel();

        // Convert learning rate
        if (model.optimizer && model.optimizer.learningRate !== undefined) {
            model.optimizer.learningRate = learningRate;
        }

        showStatus('Training in progress...', 'info');

        // Prepare training data (already normalized in loadMNISTData)
        const trainDataset = data
            .shuffle(10000)
            .batch(batchSize)
            .map(({ xs, ys }) => ({
                xs: xs.reshape([-1, 28 * 28]),
                ys
            }));

        // Prepare test data (already normalized in loadMNISTData)
        const testDataset = testData
            .batch(1000)
            .map(({ xs, ys }) => ({
                xs: xs.reshape([-1, 28 * 28]),
                ys
            }));

        // Train
        await model.fitDataset(trainDataset, {
            epochs,
            verbose: 0,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    const progress = ((epoch + 1) / epochs) * 100;
                    document.getElementById('progressFill').style.width = progress + '%';
                    document.getElementById('progressFill').textContent = Math.round(progress) + '%';
                    document.getElementById('trainingInfo').innerHTML =
                        `Epoch ${epoch + 1}/${epochs} - Loss: ${logs.loss.toFixed(4)}, Accuracy: ${logs.acc.toFixed(4)}`;
                }
            },
            validationData: testDataset
        });

        // Evaluate on test set
        const evalResult = await model.evaluateDataset(testDataset);
        const testLoss = await evalResult[0].data();
        const testAccuracy = await evalResult[1].data();

        showStatus(`Model trained! Accuracy: ${(testAccuracy[0] * 100).toFixed(2)}%`, 'success');

        // Save model
        const modelId = Date.now().toString();
        models[modelId] = {
            id: modelId,
            name: modelName,
            model: model,
            accuracy: testAccuracy[0],
            loss: testLoss[0],
            timestamp: new Date().toLocaleString()
        };

        // Save to local storage
        await saveModelToStorage(modelId, modelName, model, testAccuracy[0], testLoss[0]);

        // Update UI
        updateModelList();

        document.getElementById('progressBar').style.display = 'none';
        document.getElementById('trainBtn').disabled = false;

        // Show metrics
        const metricsDiv = document.getElementById('metrics');
        metricsDiv.style.display = 'grid';
        document.getElementById('accuracy').textContent = (testAccuracy[0] * 100).toFixed(2) + '%';
        document.getElementById('loss').textContent = testLoss[0].toFixed(4);

        tf.dispose([evalResult[0], evalResult[1]]);

    } catch (error) {
        console.error('Training error:', error);
        showStatus('Error during training: ' + error.message, 'error');
        document.getElementById('trainBtn').disabled = false;
    }
}

// Update model list UI
async function updateModelList() {
    const checkboxList = document.getElementById('modelCheckboxList');
    checkboxList.innerHTML = '';

    for (const [id, modelData] of Object.entries(models)) {
        // Calculate model size
        const modelSize = await getModelSize(id);

        // Add to checkbox list
        const checkboxItem = document.createElement('div');
        checkboxItem.className = 'model-checkbox-item';
        checkboxItem.innerHTML = `
            <input type="checkbox" id="model_${id}" value="${id}">
            <label for="model_${id}">
                <span>${modelData.name}</span>
                <span style="display: flex; gap: 5px; align-items: center;">
                    <span style="color: #999; font-size: 11px;">${(modelData.accuracy * 100).toFixed(1)}%</span>
                    <span class="model-size">${modelSize}</span>
                </span>
            </label>
            <button class="delete-model-btn" onclick="deleteModel('${id}')">Delete</button>
        `;
        checkboxList.appendChild(checkboxItem);
    }

    // Add event listeners to checkboxes to update download button state
    updateDownloadButtonState();
    document.querySelectorAll('#modelCheckboxList input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', updateDownloadButtonState);
    });
}

// Update download button state based on checkbox selection
function updateDownloadButtonState() {
    const checkboxes = document.querySelectorAll('#modelCheckboxList input[type="checkbox"]:checked');
    const downloadBtn = document.getElementById('downloadSelectedBtn');
    if (downloadBtn) {
        downloadBtn.disabled = checkboxes.length === 0;
    }
}

// Get model size from IndexedDB
async function getModelSize(modelId) {
    try {
        // Estimate size from localStorage metadata and IndexedDB
        const metadata = localStorage.getItem('model_' + modelId);
        const metadataSize = metadata ? new Blob([metadata]).size : 0;

        // For IndexedDB model, estimate based on typical model sizes
        // A typical MNIST model is around 400-800 KB
        const estimatedModelSize = 600 * 1024; // 600 KB estimate

        const totalSize = metadataSize + estimatedModelSize;
        return formatBytes(totalSize);
    } catch (error) {
        return 'Unknown';
    }
}

// Format bytes to human-readable format
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}


// Download selected models
async function downloadSelectedModels() {
    const checkboxes = document.querySelectorAll('#modelCheckboxList input[type="checkbox"]:checked');
    const selectedModelIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedModelIds.length === 0) {
        showStatus('Please select at least one model to download', 'error');
        return;
    }

    try {
        for (const modelId of selectedModelIds) {
            const modelData = models[modelId];
            if (!modelData || !modelData.model) {
                console.warn(`Model ${modelId} not found or not loaded`);
                continue;
            }

            const model = modelData.model;
            const safeName = modelData.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

            // Save using TensorFlow.js
            await model.save(`downloads://mnist_model_${safeName}`);
        }

        showStatus(`${selectedModelIds.length} model(s) downloaded successfully!`, 'success');
    } catch (error) {
        console.error('Download error:', error);
        showStatus('Error downloading models: ' + error.message, 'error');
    }
}

// Delete model
async function deleteModel(modelId) {
    if (!confirm('Are you sure you want to delete this model?')) {
        return;
    }

    try {
        // Remove from IndexedDB
        await tf.io.removeModel('indexeddb://mnist_model_' + modelId);

        // Remove from localStorage
        localStorage.removeItem('model_' + modelId);

        // Update model list in storage
        const modelList = JSON.parse(localStorage.getItem('modelList') || '[]');
        const updatedList = modelList.filter(id => id !== modelId);
        localStorage.setItem('modelList', JSON.stringify(updatedList));

        // Remove from memory
        if (models[modelId] && models[modelId].model) {
            models[modelId].model.dispose();
        }
        delete models[modelId];

        // Update UI
        await updateModelList();
        showStatus('Model deleted successfully', 'success');
    } catch (error) {
        console.error('Delete error:', error);
        showStatus('Error deleting model: ' + error.message, 'error');
    }
}

// Import model
document.getElementById('fileInput')?.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (files.length === 0) return;

    try {
        showStatus('Importing model...', 'info');

        // Load model from uploaded files
        const model = await tf.loadLayersModel(tf.io.browserFiles(
            [...files].filter(f => f.name.endsWith('.json'))[0],
            [...files].filter(f => f.name.endsWith('.bin'))
        ));

        // Create model metadata
        const modelId = Date.now().toString();
        const modelName = `Imported Model ${new Date().toLocaleTimeString()}`;

        models[modelId] = {
            id: modelId,
            name: modelName,
            model: model,
            accuracy: 0, // Unknown accuracy for imported models
            loss: 0,
            timestamp: new Date().toLocaleString()
        };

        // Save to storage
        await saveModelToStorage(modelId, modelName, model, 0, 0);

        updateModelList();
        showStatus('Model imported successfully!', 'success');

        // Clear file input
        e.target.value = '';
    } catch (error) {
        console.error('Import error:', error);
        showStatus('Error importing model: ' + error.message, 'error');
    }
});

// Local storage functions
async function saveModelToStorage(id, name, model, accuracy, loss) {
    try {
        // Save model using IndexedDB
        await model.save('indexeddb://mnist_model_' + id);

        // Save metadata
        const metadata = {
            id,
            name,
            accuracy,
            loss,
            timestamp: new Date().toLocaleString()
        };
        localStorage.setItem('model_' + id, JSON.stringify(metadata));

        // Update model list in storage
        const modelList = JSON.parse(localStorage.getItem('modelList') || '[]');
        modelList.push(id);
        localStorage.setItem('modelList', JSON.stringify(modelList));

        showStatus(`Model "${name}" saved to browser storage`, 'success');
    } catch (error) {
        console.error('Storage error:', error);
        showStatus('Error saving model: ' + error.message, 'error');
    }
}

async function loadModelsFromStorage() {
    try {
        const modelList = JSON.parse(localStorage.getItem('modelList') || '[]');

        for (const id of modelList) {
            const metadata = JSON.parse(localStorage.getItem('model_' + id) || '{}');
            if (metadata.id) {
                // Try to load the actual model from IndexedDB
                let model = null;
                try {
                    model = await tf.loadLayersModel('indexeddb://mnist_model_' + id);
                } catch (e) {
                    console.warn('Could not load model from IndexedDB:', id);
                }

                models[id] = {
                    id: metadata.id,
                    name: metadata.name,
                    model: model, // Loaded from IndexedDB
                    accuracy: metadata.accuracy,
                    loss: metadata.loss,
                    timestamp: metadata.timestamp
                };
            }
        }

        updateModelList();
    } catch (error) {
        console.error('Error loading models from storage:', error);
    }
}

function showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status show ${type}`;

    if (type !== 'error') {
        setTimeout(() => {
            statusEl.classList.remove('show');
        }, 5000);
    }
}

// Canvas drawing functionality
let isDrawing = false;
let canvasContext = null;

// Initialize canvas
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('drawCanvas');
    if (canvas) {
        canvasContext = canvas.getContext('2d');
        canvasContext.fillStyle = 'white';
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        canvasContext.strokeStyle = 'black';
        canvasContext.lineWidth = 15;
        canvasContext.lineCap = 'round';
        canvasContext.lineJoin = 'round';

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events for mobile
        canvas.addEventListener('touchstart', handleTouch);
        canvas.addEventListener('touchmove', handleTouch);
        canvas.addEventListener('touchend', stopDrawing);
    }
});

function startDrawing(e) {
    isDrawing = true;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    canvasContext.beginPath();
    canvasContext.moveTo(x, y);
}

function draw(e) {
    if (!isDrawing) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    canvasContext.lineTo(x, y);
    canvasContext.stroke();
}

function stopDrawing() {
    isDrawing = false;
    updatePreview();
}

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 'mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    e.target.dispatchEvent(mouseEvent);
}

function clearCanvas() {
    const canvas = document.getElementById('drawCanvas');
    canvasContext.fillStyle = 'white';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    document.getElementById('predictionsContainer').innerHTML = '';
    updatePreview();
}

// Update the preview canvas to show the converted 28x28 image
function updatePreview() {
    const canvas = document.getElementById('drawCanvas');
    const previewCanvas = document.getElementById('previewCanvas');
    const previewCanvasLarge = document.getElementById('previewCanvasLarge');

    if (!previewCanvas || !previewCanvasLarge) return;

    const previewCtx = previewCanvas.getContext('2d');
    const previewCtxLarge = previewCanvasLarge.getContext('2d');

    // Create a temporary 28x28 canvas
    previewCtx.fillStyle = 'white';
    previewCtx.fillRect(0, 0, 28, 28);
    previewCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 28, 28);

    // Get image data and apply the same preprocessing as prediction
    const imageData = previewCtx.getImageData(0, 0, 28, 28);
    const data = imageData.data;

    // Apply inversion (same as in prediction)
    for (let i = 0; i < data.length; i += 4) {
        // Convert to grayscale and normalize
        const gray = data[i]; // Already grayscale from canvas
        const normalized = gray / 255;
        // Invert: black becomes white, white becomes black
        const inverted = 1 - normalized;
        const finalValue = inverted * 255;

        data[i] = finalValue;     // R
        data[i + 1] = finalValue; // G
        data[i + 2] = finalValue; // B
        // Alpha stays the same
    }

    previewCtx.putImageData(imageData, 0, 0);

    // Scale up to the large preview canvas with pixelated rendering
    previewCtxLarge.imageSmoothingEnabled = false;
    previewCtxLarge.drawImage(previewCanvas, 0, 0, 28, 28, 0, 0, 140, 140);
}

// Load and display a sample MNIST image for comparison
async function loadSampleMNISTImage() {
    try {
        const manifest = await fetch('./manifest.json').then(r => r.json());
        if (!manifest.train || manifest.train.length === 0) return;

        // Get a random sample
        const randomIndex = Math.floor(Math.random() * Math.min(100, manifest.train.length));
        const sampleFile = manifest.train[randomIndex];
        const samplePath = `./mnist_images/train/${sampleFile}`;

        const img = new Image();
        img.src = samplePath;
        await new Promise(resolve => img.onload = resolve);

        const sampleCanvas = document.getElementById('sampleCanvas');
        const sampleCanvasLarge = document.getElementById('sampleCanvasLarge');

        if (!sampleCanvas || !sampleCanvasLarge) return;

        const ctx = sampleCanvas.getContext('2d');
        const ctxLarge = sampleCanvasLarge.getContext('2d');

        ctx.drawImage(img, 0, 0, 28, 28);

        // Scale up with pixelated rendering
        ctxLarge.imageSmoothingEnabled = false;
        ctxLarge.drawImage(sampleCanvas, 0, 0, 28, 28, 0, 0, 140, 140);

    } catch (error) {
        console.log('Could not load sample MNIST image:', error);
    }
}

// Multi-model prediction
async function predictMultiModel() {
    // Get selected models
    const checkboxes = document.querySelectorAll('#modelCheckboxList input[type="checkbox"]:checked');
    const selectedModelIds = Array.from(checkboxes).map(cb => cb.value);

    if (selectedModelIds.length === 0) {
        showStatus('Please select at least one model to compare', 'error');
        return;
    }

    try {
        // Prepare canvas data
        const canvas = document.getElementById('drawCanvas');

        // Create a temporary 28x28 canvas
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = 28;
        smallCanvas.height = 28;
        const smallCtx = smallCanvas.getContext('2d');

        // Draw scaled down image
        smallCtx.fillStyle = 'white';
        smallCtx.fillRect(0, 0, 28, 28);
        smallCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 28, 28);

        // Convert to tensor and INVERT (MNIST is white digits on black background)
        const tensor = tf.browser.fromPixels(smallCanvas, 1)
            .asType('float32')
            .div(255)
            .mul(-1)  // Invert: 0 becomes -1, 1 becomes 0
            .add(1)   // Shift: -1 becomes 0, 0 becomes 1
            .reshape([1, 28 * 28]);

        // Get predictions from all selected models
        const predictionsContainer = document.getElementById('predictionsContainer');
        predictionsContainer.innerHTML = '';

        for (const modelId of selectedModelIds) {
            const modelData = models[modelId];
            if (!modelData.model) {
                console.warn(`Model ${modelId} not loaded`);
                continue;
            }

            // Make prediction
            const prediction = modelData.model.predict(tensor);
            const probabilities = await prediction.data();

            // Find predicted digit
            const predictedDigit = probabilities.indexOf(Math.max(...probabilities));
            const confidence = probabilities[predictedDigit];

            // Create prediction display
            const predictionDiv = document.createElement('div');
            predictionDiv.className = 'model-prediction';

            const headerDiv = document.createElement('div');
            headerDiv.className = 'model-prediction-header';
            headerDiv.innerHTML = `
                <span>${modelData.name}</span>
                <span class="predicted-digit">Predicted: ${predictedDigit} (${(confidence * 100).toFixed(1)}%)</span>
            `;
            predictionDiv.appendChild(headerDiv);

            // Create histogram
            const histogramContainer = document.createElement('div');
            histogramContainer.className = 'histogram-container';

            const histogram = document.createElement('div');
            histogram.className = 'histogram';

            for (let i = 0; i < 10; i++) {
                const bar = document.createElement('div');
                const probability = probabilities[i];
                const height = probability * 100;

                bar.className = 'histogram-bar';
                bar.style.height = height + '%';
                bar.title = `Digit ${i}: ${(probability * 100).toFixed(2)}%`;

                const label = document.createElement('div');
                label.className = 'histogram-bar-label';
                label.textContent = i;
                bar.appendChild(label);

                if (probability > 0.05) {
                    const value = document.createElement('div');
                    value.className = 'histogram-bar-value';
                    value.textContent = (probability * 100).toFixed(1) + '%';
                    bar.appendChild(value);
                }

                histogram.appendChild(bar);
            }

            histogramContainer.appendChild(histogram);
            predictionDiv.appendChild(histogramContainer);
            predictionsContainer.appendChild(predictionDiv);

            prediction.dispose();
        }

        tensor.dispose();

    } catch (error) {
        console.error('Prediction error:', error);
        showStatus('Error during prediction: ' + error.message, 'error');
    }
}
