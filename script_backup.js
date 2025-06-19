const CLOUD_FUNCTION_URL = "https://hsad-final-orchestrator-v3-2zrbh4cqea-uc.a.run.app";

document.addEventListener('DOMContentLoaded', () => {
    // --- UI 요소 변수 선언 ---
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
    let currentUploadFile = null;

    // --- 이벤트 리스너 연결 ---
    selectButton.addEventListener('click', () => uploadFileInput.click());
    uploadFileInput.addEventListener('change', (event) => handleFileSelect(event));
    uploadButton.addEventListener('click', handleUpload);
    textSearchButton.addEventListener('click', handleTextSearch);
    
    // VEO 프롬프트 복사 버튼 이벤트 위임
    resultsGrid.addEventListener('click', function(event) {
        if (event.target && event.target.classList.contains('copy-button')) {
            const promptText = event.target.previousElementSibling.textContent;
            navigator.clipboard.writeText(promptText).then(() => {
                event.target.textContent = '복사 완료!';
                setTimeout(() => { event.target.textContent = 'VEO 프롬프트 복사'; }, 2000);
            }, (err) => {
                console.error('클립보드 복사 실패:', err);
                alert('프롬프트 복사에 실패했습니다.');
            });
        }
    });

    // --- 함수 정의 ---
    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            currentUploadFile = e.target.result;
            imagePreview.src = e.target.result;
            previewArea.classList.remove('hidden');
            uploadButton.disabled = false;
        };
        reader.readAsDataURL(file);
    }
    async function handleUpload() {
        if (!currentUploadFile) return;
        await callOrchestrator({ action: 'upload', image_data: currentUploadFile }, '자산 등록 및 AI 분석 중...');
    }
    async function handleTextSearch() {
        const query = textQueryInput.value;
        if (!query) return;
        await callOrchestrator({ action: 'search', text_query: query }, `"${query}" 검색 중...`);
    }
    async function callOrchestrator(payload, statusMessage) {
        showLoading(statusMessage);
        try {
            const response = await fetch(CLOUD_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '알 수 없는 서버 오류');
            if (payload.action === 'upload') { showSuccess(data.message); }
            else if (payload.action === 'search') { renderResults(data); }
        } catch (error) { showError(`오류 발생: ${error.message}`); }
    }
    function showLoading(message) { statusArea.innerHTML = `<div class="loader"></div><p>${message}</p>`; resultsSection.classList.add('hidden'); }
    function showSuccess(message) { statusArea.innerHTML = `<p style="color: #2ecc71; font-weight: bold;">${message}</p>`; }
    function showError(message) { statusArea.innerHTML = `<p style="color: #e74c3c; font-weight: bold;">${message}</p>`; }
    function renderResults(results) {
        statusArea.innerHTML = '';
        resultsGrid.innerHTML = '';
        resultsSection.classList.remove('hidden');
        if (!Array.isArray(results) || results.length === 0) {
            resultsGrid.innerHTML = '<p>검색 결과가 없습니다.</p>';
        } else {
            results.forEach(item => {
                const httpUrl = `https://storage.googleapis.com/${item.image_path.replace('gs://', '')}`;
                const resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                let conceptsHtml = '<span style="color: #999;">태그 없음</span>';
                if (Array.isArray(item.concepts) && item.concepts.length > 0) {
                    conceptsHtml = item.concepts.map(tag => `<span class="concept-tag">${tag}</span>`).join(' ');
                }
                const createdAt = item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : '정보 없음';

                resultItem.innerHTML = `
                    <img src="${httpUrl}" alt="${item.alt_text || item.product_type || 'Uploaded Image'}">
                    <div class="info">
                        <h3>${item.product_type || 'N/A'}</h3>
                        <ul class="metadata-list">
                             <li><span class="label">색상</span><span class="value">${item.color || '정보 없음'}</span></li>
                             <li><span class="label">컨셉 태그</span><span class="value"><div class="concept-tags">${conceptsHtml}</div></span></li>
                             <li><span class="label">AI 추천 마케팅 카피</span><span class="value marketing-copy-value">${item.marketing_copy || '정보 없음'}</span></li>
                             <li>
                                <span class="label">✨ AI 영상 제작 프롬프트 (VEO Ready)</span>
                                <div class="veo-prompt-wrapper">
                                    <pre class="veo-prompt-value">${item.veo_prompt || '생성된 프롬프트가 없습니다.'}</pre>
                                    <button class="copy-button">VEO 프롬프트 복사</button>
                                </div>
                             </li>
                             <li><span class="label">추천 Alt Text</span><span class="value alt-text-value">${item.alt_text || '정보 없음'}</span></li>
                             <li><span class="label">생성일</span><span class="value">${createdAt}</span></li>
                        </ul>
                    </div>`;
                resultsGrid.appendChild(resultItem);
            });
        }
    }
});
