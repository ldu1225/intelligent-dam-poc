let CLOUD_FUNCTION_URL = "https://hsad-dam-function-final-2zrbh4cqea-uc.a.run.app";
let assetChart = null;
document.addEventListener('DOMContentLoaded', () => {
    const uploadFileInput = document.getElementById('upload-file-input');
    const selectButton = document.getElementById('select-button');
    const previewArea = document.getElementById('preview-area');
    const imagePreview = document.getElementById('image-preview');
    const uploadButton = document.getElementById('upload-button');
    const textQueryInput = document.getElementById('text-query');
    const textSearchButton = document.getElementById('text-search-button');
    const statusArea = document.getElementById('status-area');
    const resultsSection = document.getElementById('results-section');
    const resultsGrid = document.getElementById('results-grid');
    const chatWindow = document.getElementById('chat-window');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatSendButton = document.getElementById('chat-send-button');
    const imageSearchInput = document.getElementById('image-search-input');
    const imageSearchSelectButton = document.getElementById('image-search-select-button');
    const imageSearchPreviewArea = document.getElementById('image-search-preview-area');
    const imageSearchPreview = document.getElementById('image-search-preview');
    const imageSearchButton = document.getElementById('image-search-button');
    const similarResultsSection = document.getElementById('similar-results-section');
    const similarResultsGrid = document.getElementById('similar-results-grid');
    let currentUploadFile = null;
    let currentSearchImageFile = null;
    selectButton.addEventListener('click', () => uploadFileInput.click());
    uploadFileInput.addEventListener('change', (event) => handleFileSelect(event, imagePreview, previewArea, uploadButton, (file) => currentUploadFile = file));
    uploadButton.addEventListener('click', handleUpload);
    textSearchButton.addEventListener('click', handleTextSearch);
    textQueryInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleTextSearch(); });
    chatSendButton.addEventListener('click', handleChat);
    chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleChat(); });
    imageSearchSelectButton.addEventListener('click', () => imageSearchInput.click());
    imageSearchInput.addEventListener('change', (event) => handleFileSelect(event, imageSearchPreview, imageSearchPreviewArea, imageSearchButton, (file) => currentSearchImageFile = file));
    imageSearchButton.addEventListener('click', handleImageSearch);
    [resultsGrid, similarResultsGrid].forEach(grid => grid.addEventListener('click', (event) => copyPrompt(event)));
    loadDashboardData();
    function handleFileSelect(event, previewEl, previewAreaEl, buttonEl, fileSetter) {
        const file = event.target.files[0];
        if (!file) return;
        fileSetter(file);
        const reader = new FileReader();
        reader.onload = e => { previewEl.src = e.target.result; previewAreaEl.classList.remove('hidden'); buttonEl.disabled = false; };
        reader.readAsDataURL(file);
    }
    function copyPrompt(event) {
        if (event.target && event.target.classList.contains('copy-button')) {
            const promptText = event.target.previousElementSibling.textContent;
            navigator.clipboard.writeText(promptText).then(() => {
                event.target.textContent = '복사 완료!';
                setTimeout(() => { event.target.textContent = 'VEO 프롬프트 복사'; }, 2000);
            });
        }
    }
    async function handleUpload() { if (currentUploadFile) await callApiWithFileReader(currentUploadFile, { action: 'upload' }, 'upload'); }
    async function handleImageSearch() { if (currentSearchImageFile) await callApiWithFileReader(currentSearchImageFile, { action: 'find_similar_images' }, 'image_search'); }
    async function handleTextSearch() { const query = textQueryInput.value; if (query) await callApi({ action: 'search', text_query: query }, 'text_search'); }
    async function handleChat() {
        const question = chatInput.value;
        if (!question) return;
        addChatMessage('user', question);
        chatInput.value = '';
        await callApi({ action: 'rag_chat', question: question }, 'chat');
    }
    function callApiWithFileReader(file, payload, actionType) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            payload.image_data = e.target.result;
            await callApi(payload, actionType);
        };
        reader.readAsDataURL(file);
    }
    function addChatMessage(sender, message) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);
        messageElement.textContent = message;
        chatMessages.appendChild(messageElement);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }
    async function callApi(payload, actionType) {
        showLoading(actionType);
        hideAllResults();
        try {
            if (!CLOUD_FUNCTION_URL) {
                // 백엔드 URL이 비어있으면, 현재 배포된 함수의 URL을 자동으로 다시 가져옵니다.
                const functionName = "hsad-dam-function-final";
                const region = "us-central1";
                console.log("백엔드 URL이 설정되지 않아, 자동으로 다시 가져옵니다...");
                const url = await gcloud.functions.describe(functionName, {region: region}).then(res => res.serviceConfig.uri);
                if(url) CLOUD_FUNCTION_URL = url;
                else throw new Error("배포된 함수 URL을 가져올 수 없습니다. STEP 4를 다시 실행해주세요.");
            }
            const response = await fetch(CLOUD_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '알 수 없는 서버 오류 (HTTP ' + response.status + ')');
            statusArea.innerHTML = '';
            if (payload.action === 'upload') {
                showSuccess(data.message);
                loadDashboardData();
            }
            else if (payload.action === 'search') renderResults(data, resultsGrid, resultsSection, false);
            else if (payload.action === 'find_similar_images') renderResults(data, similarResultsGrid, similarResultsSection, true);
            else if (payload.action === 'rag_chat') addChatMessage('bot', data.answer);
            else if (payload.action === 'get_dashboard_data') renderDashboardChart(data);
        } catch (error) { console.error(error); showError(`오류 발생: ${error.message}`); }
    }
    let loadingInterval;
    function showLoading(actionType) {
        clearInterval(loadingInterval);
        const messages = {
            upload: ['이미지 분석 중...', 'AI 컨셉 추출 중...', '마케팅 카피 생성 중...', '데이터베이스 저장 중...'],
            text_search: ['검색어 분석 중...', '데이터베이스 검색 중...', '결과를 불러오는 중...'],
            image_search: ['이미지 벡터 변환 중...', '유사 이미지 검색 중...', '결과를 분석하는 중...'],
            chat: ['DAM 데이터 분석 중...', 'AI 답변 생성 중...'],
            default: ['처리 중입니다...']
        };
        const steps = messages[actionType] || messages.default;
        statusArea.innerHTML = `<div class="loader-container"><div class="dynamic-text-container"></div></div>`;
        const textContainer = statusArea.querySelector('.dynamic-text-container');
        let i = 0;
        textContainer.innerHTML = `<span>${steps[i]}</span>`;
        i++;
        loadingInterval = setInterval(() => {
            if (i < steps.length) {
                textContainer.innerHTML += `<span>${steps[i]}</span>`;
                i++;
            } else {
                clearInterval(loadingInterval);
            }
        }, 1500);
    }
    function showSuccess(message) { clearInterval(loadingInterval); statusArea.innerHTML = `<p style="color: #27ae60; font-weight: bold;">${message}</p>`; }
    function showError(message) { clearInterval(loadingInterval); statusArea.innerHTML = `<p style="color: #c0392b; font-weight: bold;">${message}</p>`; }
    function hideAllResults() { [resultsSection, similarResultsSection].forEach(s => s.classList.add('hidden')); }
    function renderResults(results, gridElement, sectionElement, isSimilaritySearch) {
        gridElement.innerHTML = '';
        sectionElement.classList.remove('hidden');
        if (!Array.isArray(results) || results.length === 0) {
            gridElement.innerHTML = '<p>결과가 없습니다.</p>';
        } else {
            results.forEach(item => {
                const httpUrl = item.image_path ? `https://storage.googleapis.com/${item.image_path.replace('gs://', '')}` : '';
                const resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                let conceptsHtml = '<span style="color: #999;">태그 없음</span>';
                if (Array.isArray(item.concepts) && item.concepts.length > 0) {
                    conceptsHtml = item.concepts.map(tag => `<span class="concept-tag">${tag}</span>`).join(' ');
                }
                const createdAt = item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '정보 없음';
                const similarityInfoHtml = isSimilaritySearch ? `
                    <li><span class="label">✨ 유사도</span><span class="value similarity-score">${item.similarity_score || 'N/A'}%</span></li>
                    <li><span class="label">🤖 AI 분석</span><span class="value similarity-reason">${item.similarity_reason || '분석 중...'}</span></li>
                ` : `
                    <li><span class="label">AI 추천 마케팅 카피</span><span class="value marketing-copy-value">${item.marketing_copy || '정보 없음'}</span></li>
                    <li>
                       <span class="label">✨ AI 영상 제작 프롬프트 (VEO Ready)</span>
                       <div class="veo-prompt-wrapper">
                           <pre class="veo-prompt-value">${item.veo_prompt || '생성된 프롬프트가 없습니다.'}</pre>
                           <button class="copy-button">VEO 프롬프트 복사</button>
                       </div>
                    </li>
                    <li><span class="label">추천 Alt Text</span><span class="value alt-text-value">${item.alt_text || '정보 없음'}</span></li>
                `;
                resultItem.innerHTML = `
                    <img src="${httpUrl}" alt="${item.alt_text || 'Asset Image'}" onerror="this.style.display='none'">
                    <div class="info">
                        <h3>${item.product_type || 'N/A'}</h3>
                        <ul class="metadata-list">
                             <li><span class="label">색상</span><span class="value">${item.color || '정보 없음'}</span></li>
                             <li><span class="label">컨셉 태그</span><span class="value"><div class="concept-tags">${conceptsHtml}</div></span></li>
                             ${similarityInfoHtml}
                             <li><span class="label">생성일</span><span class="value">${createdAt}</span></li>
                        </ul>
                    </div>`;
                gridElement.appendChild(resultItem);
            });
        }
    }
    async function loadDashboardData() { await callApi({ action: 'get_dashboard_data' }, 'default'); }
    function renderDashboardChart(data) {
        const ctx = document.getElementById('asset-chart').getContext('2d');
        if (assetChart) { assetChart.destroy(); }
        if (!data || data.length === 0) {
            document.getElementById('dashboard-chart-container').innerHTML = '<p>아직 표시할 데이터가 없습니다. 자산을 등록해주세요.</p>';
            return;
        }
        assetChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.product_type),
                datasets: [{
                    label: '자산 개수',
                    data: data.map(d => d.count),
                    backgroundColor: ['#FF6A88', '#FF8A5B', '#FFB347', '#FFD166', '#A0E7E5', '#B4F8C8', '#79E1B9', '#85D2F2', '#9FA8DA', '#CE93D8'],
                    borderColor: '#FFFFFF', borderWidth: 4, hoverOffset: 12
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: true, cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { font: { family: "'Pretendard', sans-serif", size: 12 }, padding: 20, boxWidth: 15, } },
                    tooltip: { titleFont: { family: "'Pretendard', sans-serif" }, bodyFont: { family: "'Pretendard', sans-serif" }, padding: 10, cornerRadius: 8 }
                }
            }
        });
    }
});
