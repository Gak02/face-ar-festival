// グローバル変数
let faceDetection, camera, videoElement, canvasElement, canvasCtx;
let scene, renderer, threeCamera;
let faceMesh, eventLogo, fireworkSystem;
let isInitialized = false;
let currentFaces = [];
let logoSettings = {
    type: 'festival',
    size: 1.0,
    position: 'top',
    visible: true
};

// 花火の色配列
const fireworkColors = [
    0xFF6B6B, 0x4ECDC4, 0xFFD93D, 0x6BCF7F, 
    0xFF8C42, 0x845EC2, 0xF9F871, 0xFF69B4
];

// ロゴテンプレート
const logoTemplates = {
    festival: {
        text: '🎆 夏祭り 🎆\n人事イベント 2025',
        colors: ['#FF6B6B', '#4ECDC4']
    },
    fireworks: {
        text: '🎇 花火大会 🎇\nSummer Festival',
        colors: ['#FF8C42', '#FFD93D']
    },
    matsuri: {
        text: '🏮 お祭り 🏮\n日本の夏',
        colors: ['#845EC2', '#F9F871']
    },
    company: {
        text: '🏢 会社イベント 🏢\nTeam Building',
        colors: ['#2C3E50', '#3498DB']
    }
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    initializeLoadingSteps();
    setTimeout(initializeFaceAR, 1000);
});

// ローディングステップ管理
function initializeLoadingSteps() {
    const steps = ['step-camera', 'step-mediapipe', 'step-three', 'step-ready'];
    let currentStep = 0;
    
    const updateStep = (stepId, status = 'active') => {
        const stepEl = document.getElementById(stepId);
        if (stepEl) {
            stepEl.className = `step ${status}`;
        }
    };
    
    // グローバルに公開してコールバックで使用
    window.updateLoadingStep = (step, status) => {
        if (steps.includes(step)) {
            updateStep(step, status);
        }
    };
}

// 顔認識AR初期化
async function initializeFaceAR() {
    try {
        console.log('🚀 顔認識AR初期化開始');
        
        // 環境チェック
        if (!validateEnvironment()) {
            throw new Error('環境要件を満たしていません');
        }
        
        // カメラ初期化
        updateLoadingStep('step-camera', 'active');
        await initializeCamera();
        updateLoadingStep('step-camera', 'completed');
        
        // MediaPipe初期化
        updateLoadingStep('step-mediapipe', 'active');
        await initializeMediaPipe();
        updateLoadingStep('step-mediapipe', 'completed');
        
        // Three.js初期化
        updateLoadingStep('step-three', 'active');
        await initializeThreeJS();
        updateLoadingStep('step-three', 'completed');
        
        // UI設定
        setupEventListeners();
        
        // 完了
        updateLoadingStep('step-ready', 'completed');
        setTimeout(hideLoadingScreen, 1000);
        
        isInitialized = true;
        console.log('✅ 顔認識AR初期化完了');
        
    } catch (error) {
        console.error('❌ 顔認識AR初期化失敗:', error);
        showError('初期化に失敗しました: ' + error.message);
    }
}

// 環境検証
function validateEnvironment() {
    const checks = {
        https: window.location.protocol === 'https:',
        mediaDevices: 'mediaDevices' in navigator,
        getUserMedia: navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices,
        webgl: (() => {
            try {
                const canvas = document.createElement('canvas');
                return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
            } catch(e) { return false; }
        })()
    };
    
    const failed = Object.entries(checks).filter(([key, value]) => !value);
    if (failed.length > 0) {
        console.error('環境チェック失敗:', failed.map(([key]) => key));
        return false;
    }
    
    return true;
}

// カメラ初期化
async function initializeCamera() {
    try {
        videoElement = document.getElementById('input_video');
        canvasElement = document.getElementById('output_canvas');
        canvasCtx = canvasElement.getContext('2d');
        
        // カメラ設定
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                facingMode: 'user', // 前面カメラ優先
                frameRate: { ideal: 30 }
            }
        });
        
        videoElement.srcObject = stream;
        
        // ビデオメタデータ読み込み完了を待つ
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                
                // Canvas サイズ調整
                const { videoWidth, videoHeight } = videoElement;
                canvasElement.width = videoWidth;
                canvasElement.height = videoHeight;
                
                // CSS でフィット
                const aspectRatio = videoWidth / videoHeight;
                const windowRatio = window.innerWidth / window.innerHeight;
                
                if (aspectRatio > windowRatio) {
                    canvasElement.style.width = '100%';
                    canvasElement.style.height = 'auto';
                } else {
                    canvasElement.style.width = 'auto';
                    canvasElement.style.height = '100%';
                }
                
                resolve();
            };
        });
        
        console.log('📹 カメラ初期化完了');
    } catch (error) {
        throw new Error(`カメラアクセス失敗: ${error.message}`);
    }
}

// MediaPipe 初期化
async function initializeMediaPipe() {
    try {
        faceDetection = new FaceDetection({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`;
            }
        });
        
        faceDetection.setOptions({
            model: 'short',
            minDetectionConfidence: 0.7
        });
        
        faceDetection.onResults(onFaceDetectionResults);
        
        // カメラユーティリティ設定
        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (faceDetection) {
                    await faceDetection.send({image: videoElement});
                }
            },
            width: 1280,
            height: 720
        });
        
        console.log('🧠 MediaPipe初期化完了');
    } catch (error) {
        throw new Error(`MediaPipe初期化失敗: ${error.message}`);
    }
}

// Three.js 初期化
async function initializeThreeJS() {
    try {
        const threeCanvas = document.getElementById('three-canvas');
        
        // Scene作成
        scene = new THREE.Scene();
        
        // Camera設定（ビデオと同じアスペクト比）
        const aspect = canvasElement.width / canvasElement.height;
        threeCamera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        threeCamera.position.z = 1;
        
        // Renderer設定
        renderer = new THREE.WebGLRenderer({
            canvas: threeCanvas,
            alpha: true,
            antialias: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);
        
        // ライト追加
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);
        
        // ロゴ作成
        createEventLogo();
        
        // 花火システム初期化
        fireworkSystem = new FaceFireworkSystem();
        
        // アニメーションループ開始
        animate();
        
        console.log('🎮 Three.js初期化完了');
    } catch (error) {
        throw new Error(`Three.js初期化失敗: ${error.message}`);
    }
}

// 顔検出結果処理
function onFaceDetectionResults(results) {
    // Canvas をクリア
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // ビデオを描画
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    
    // 顔認識結果を保存
    currentFaces = results.detections || [];
    
    // 顔認識ステータス更新
    updateFaceStatus(currentFaces.length);
    
    // デバッグ用：顔の枠線表示（開発時のみ）
    if (currentFaces.length > 0) {
        drawFaceOutlines(results.detections);
    }
    
    canvasCtx.restore();
    
    // Three.js のロゴ位置を更新
    updateLogoPositions();
}

// 顔認識ステータス更新
function updateFaceStatus(faceCount) {
    const statusEl = document.getElementById('face-status');
    const statusIcon = statusEl.querySelector('.status-icon');
    const statusText = statusEl.querySelector('.status-text');
    
    if (faceCount > 0) {
        statusEl.className = 'face-status detected';
        statusIcon.textContent = '🎯';
        statusText.textContent = `${faceCount}人の顔を認識中`;
    } else {
        statusEl.className = 'face-status detecting';
        statusIcon.textContent = '📱';
        statusText.textContent = '顔を探しています...';
    }
}

// 顔の枠線描画（デバッグ用）
function drawFaceOutlines(detections) {
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#00FF00';
    
    detections.forEach(detection => {
        const bbox = detection.boundingBox;
        const x = bbox.xCenter * canvasElement.width - (bbox.width * canvasElement.width) / 2;
        const y = bbox.yCenter * canvasElement.height - (bbox.height * canvasElement.height) / 2;
        const width = bbox.width * canvasElement.width;
        const height = bbox.height * canvasElement.height;
        
        canvasCtx.strokeRect(x, y, width, height);
        
        // 信頼度表示
        canvasCtx.fillStyle = '#00FF00';
        canvasCtx.font = '16px Arial';
        canvasCtx.fillText(
            `${Math.round(detection.score * 100)}%`, 
            x, y - 10
        );
    });
}

// イベントロゴ作成
function createEventLogo() {
    const template = logoTemplates[logoSettings.type];
    
    // Canvas でテキストテクスチャ作成
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;
    
    // グラデーション背景
    const gradient = context.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, template.colors[0]);
    gradient.addColorStop(1, template.colors[1]);
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, 512, 256);
    
    // テキスト描画
    context.fillStyle = '#FFFFFF';
    context.font = 'bold 32px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeStyle = '#000000';
    context.lineWidth = 2;
    
    const lines = template.text.split('\n');
    lines.forEach((line, index) => {
        const y = 128 + (index - 0.5) * 40;
        context.strokeText(line, 256, y);
        context.fillText(line, 256, y);
    });
    
    // 枠線
    context.strokeStyle = '#FFFFFF';
    context.lineWidth = 4;
    context.strokeRect(0, 0, 512, 256);
    
    // Three.js テクスチャ作成
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // 既存のロゴを削除
    if (eventLogo) {
        scene.remove(eventLogo);
        eventLogo.geometry.dispose();
        eventLogo.material.dispose();
    }
    
    // 新しいロゴメッシュ作成
    const logoGeometry = new THREE.PlaneGeometry(0.4, 0.2);
    const logoMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    eventLogo = new THREE.Mesh(logoGeometry, logoMaterial);
    eventLogo.visible = logoSettings.visible;
    scene.add(eventLogo);
    
    console.log('🏮 ロゴ作成完了:', logoSettings.type);
}

// ロゴ位置更新
function updateLogoPositions() {
    if (!eventLogo || currentFaces.length === 0) {
        if (eventLogo) eventLogo.visible = false;
        return;
    }
    
    // 複数の顔がある場合は最初の顔を使用
    const face = currentFaces[0];
    const bbox = face.boundingBox;
    
    // 正規化座標を Three.js 座標系に変換
    const x = (bbox.xCenter * 2 - 1) * -1; // X軸反転（ミラー効果）
    let y = -(bbox.yCenter * 2 - 1);      // Y軸反転
    
    // ロゴ位置の調整
    const faceHeight = bbox.height * 2;
    switch (logoSettings.position) {
        case 'top':
            y += faceHeight * 0.8;
            break;
        case 'crown':
            y += faceHeight * 0.6;
            break;
        case 'forehead':
            y += faceHeight * 0.3;
            break;
    }
    
    // ロゴのサイズと位置を更新
    eventLogo.position.set(x, y, 0);
    eventLogo.scale.setScalar(logoSettings.size * (bbox.width + bbox.height));
    eventLogo.visible = logoSettings.visible;
    
    // 軽いアニメーション
    const time = Date.now() * 0.001;
    eventLogo.rotation.z = Math.sin(time * 2) * 0.05;
}

// 顔認識用花火システム
class FaceFireworkSystem {
    constructor() {
        this.fireworks = [];
        this.particleCount = 200;
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.PointsMaterial({
            size: 0.02,
            transparent: true,
            opacity: 0.8,
            vertexColors: true,
            blending: THREE.AdditiveBlending
        });
        
        this.points = new THREE.Points(this.geometry, this.material);
        scene.add(this.points);
        
        this.initializeParticles();
    }
    
    initializeParticles() {
        const positions = new Float32Array(this.particleCount * 3);
        const colors = new Float32Array(this.particleCount * 3);
        
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    
    createFirework(intensity = 3) {
        if (currentFaces.length === 0) return;
        
        // 認識された顔の周りに花火を作成
        currentFaces.forEach((face, index) => {
            const bbox = face.boundingBox;
            const centerX = (bbox.xCenter * 2 - 1) * -1;
            const centerY = -(bbox.yCenter * 2 - 1);
            
            // 顔周辺のランダム位置
            const particleCount = 30 * intensity;
            const color = new THREE.Color(fireworkColors[index % fireworkColors.length]);
            
            const firework = {
                particles: [],
                startTime: Date.now(),
                duration: 3000,
                color: color
            };
            
            for (let i = 0; i < particleCount; i++) {
                const angle = (Math.PI * 2 * i) / particleCount;
                const radius = 0.1 + Math.random() * 0.2;
                
                firework.particles.push({
                    position: new THREE.Vector3(
                        centerX + Math.cos(angle) * radius * Math.random(),
                        centerY + Math.sin(angle) * radius * Math.random(),
                        0
                    ),
                    velocity: new THREE.Vector3(
                        Math.cos(angle) * 0.01 * Math.random(),
                        Math.sin(angle) * 0.01 * Math.random() + 0.005,
                        0
                    ),
                    life: 1.0,
                    initialLife: 1.0
                });
            }
            
            this.fireworks.push(firework);
        });
        
        this.updateParticles();
        console.log('🎆 顔周辺に花火発射');
    }
    
    update() {
        const currentTime = Date.now();
        
        // 期限切れの花火を削除
        this.fireworks = this.fireworks.filter(firework => {
            return currentTime - firework.startTime < firework.duration;
        });
        
        // パーティクル更新
        this.fireworks.forEach(firework => {
            const elapsed = (currentTime - firework.startTime) / 1000;
            
            firework.particles.forEach(particle => {
                // 重力と減衰
                particle.velocity.y -= 0.008;
                particle.velocity.multiplyScalar(0.996);
                
                // 位置更新
                particle.position.add(particle.velocity.clone().multiplyScalar(0.016));
                
                // 生命値
                particle.life = Math.max(0, particle.initialLife - elapsed / 3);
            });
        });
        
        this.updateParticles();
    }
    
    updateParticles() {
        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;
        let index = 0;
        
        // リセット
        positions.fill(0);
        colors.fill(0);
        
        // アクティブパーティクル描画
        this.fireworks.forEach(firework => {
            firework.particles.forEach(particle => {
                if (particle.life > 0 && index < positions.length / 3) {
                    const i = index * 3;
                    
                    positions[i] = particle.position.x;
                    positions[i + 1] = particle.position.y;
                    positions[i + 2] = particle.position.z;
                    
                    colors[i] = firework.color.r * particle.life;
                    colors[i + 1] = firework.color.g * particle.life;
                    colors[i + 2] = firework.color.b * particle.life;
                    
                    index++;
                }
            });
        });
        
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.setDrawRange(0, index);
    }
}

// イベントリスナー設定
function setupEventListeners() {
    // 花火ボタン
    document.getElementById('firework-btn').addEventListener('click', () => {
        const intensity = parseInt(document.getElementById('firework-intensity').value);
        fireworkSystem.createFirework(intensity);
    });
    
    // ロゴ表示切替
    document.getElementById('toggle-logo').addEventListener('click', () => {
        logoSettings.visible = !logoSettings.visible;
        if (eventLogo) {
            eventLogo.visible = logoSettings.visible;
        }
        
        const btn = document.getElementById('toggle-logo');
        btn.textContent = logoSettings.visible ? '🏮 ロゴ表示切替' : '🏮 ロゴを表示';
    });
    
    // ロゴ変更ボタン
    document.getElementById('change-logo').addEventListener('click', () => {
        document.getElementById('logo-modal').style.display = 'block';
    });
    
    // ロゴサイズ調整
    const logoSizeSlider = document.getElementById('logo-size');
    const logoSizeValue = document.getElementById('logo-size-value');
    
    logoSizeSlider.addEventListener('input', (e) => {
        logoSettings.size = parseFloat(e.target.value);
        logoSizeValue.textContent = logoSettings.size.toFixed(1);
    });
    
    // ロゴ位置変更
    document.getElementById('logo-position').addEventListener('change', (e) => {
        logoSettings.position = e.target.value;
    });
    
    // 花火強度表示
    const fireworkSlider = document.getElementById('firework-intensity');
    const fireworkValue = document.getElementById('firework-intensity-value');
    
    fireworkSlider.addEventListener('input', (e) => {
        fireworkValue.textContent = e.target.value;
    });
    
    // ロゴ選択モーダル
    document.querySelectorAll('.logo-option').forEach(option => {
        option.addEventListener('click', () => {
            const logoType = option.dataset.logo;
            selectLogo(logoType);
            document.getElementById('logo-modal').style.display = 'none';
        });
    });
    
    // モーダル関連
    setupModalEvents();
    
    // ヘルプボタン
    document.getElementById('help-btn').addEventListener('click', () => {
        document.getElementById('help-modal').style.display = 'block';
    });
    
    // ウィンドウリサイズ対応
    window.addEventListener('resize', onWindowResize);
    
    console.log('🎛️ イベントリスナー設定完了');
}

// ロゴ選択
function selectLogo(logoType) {
    logoSettings.type = logoType;
    createEventLogo();
    
    // 選択状態を視覚的に更新
    document.querySelectorAll('.logo-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.logo === logoType);
    });
    
    console.log('🎨 ロゴ変更:', logoType);
}

// モーダルイベント設定
function setupModalEvents() {
    // モーダル閉じるボタン
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });
    
    // モーダル外クリックで閉じる
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
}

// ウィンドウリサイズ処理
function onWindowResize() {
    if (renderer && threeCamera) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        renderer.setSize(width, height);
        threeCamera.aspect = width / height;
        threeCamera.updateProjectionMatrix();
        
        console.log('📐 ウィンドウサイズ更新:', width, 'x', height);
    }
}

// アニメーションループ
function animate() {
    requestAnimationFrame(animate);
    
    try {
        // 花火システム更新
        if (fireworkSystem) {
            fireworkSystem.update();
        }
        
        // Three.js レンダリング
        if (renderer && scene && threeCamera) {
            renderer.render(scene, threeCamera);
        }
    } catch (error) {
        console.error('アニメーションエラー:', error);
    }
}

// カメラ開始
function startCamera() {
    if (camera && !camera.isRunning) {
        camera.start();
        console.log('📹 カメラ開始');
    }
}

// カメラ停止
function stopCamera() {
    if (camera && camera.isRunning) {
        camera.stop();
        console.log('📹 カメラ停止');
    }
}

// ローディング画面を隠す
function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    loadingScreen.style.opacity = '0';
    loadingScreen.style.transition = 'opacity 0.5s ease';
    
    setTimeout(() => {
        loadingScreen.style.display = 'none';
        startCamera(); // カメラ開始
    }, 500);
}

// エラー表示
function showError(message) {
    const errorElement = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    
    document.getElementById('loading-screen').style.display = 'none';
    errorText.textContent = message;
    errorElement.style.display = 'flex';
}

// 代替モード（簡易版）
function showFallbackMode() {
    alert('代替モードは開発中です。カメラアクセスを許可して再読み込みしてください。');
    location.reload();
}

// クリーンアップ処理
window.addEventListener('beforeunload', () => {
    console.log('🧹 リソースクリーンアップ');
    
    // カメラ停止
    stopCamera();
    
    // ビデオストリーム停止
    if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
    
    // Three.js リソース解放
    if (renderer) {
        renderer.dispose();
    }
    
    if (scene) {
        scene.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }
});

// デバッグ用関数
function debugInfo() {
    console.log('=== 顔認識AR デバッグ情報 ===');
    console.log('初期化完了:', isInitialized);
    console.log('認識された顔の数:', currentFaces.length);
    console.log('ロゴ設定:', logoSettings);
    console.log('ビデオサイズ:', videoElement ? `${videoElement.videoWidth}x${videoElement.videoHeight}` : 'N/A');
    console.log('Canvas サイズ:', canvasElement ? `${canvasElement.width}x${canvasElement.height}` : 'N/A');
    console.log('Three.js シーン:', scene ? scene.children.length + ' objects' : 'N/A');
}

// グローバル公開
window.debugInfo = debugInfo;
window.createFirework = () => fireworkSystem?.createFirework();
window.toggleDebugMode = () => {
    // デバッグモード切り替え（顔の枠線表示など）
    window.debugMode = !window.debugMode;
    console.log('デバッグモード:', window.debugMode ? 'ON' : 'OFF');
};