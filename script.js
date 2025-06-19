const CLOUD_FUNCTION_URL = "https://hsad-final-orchestrator-v3-2zrbh4cqea-uc.a.run.app";
document.addEventListener('DOMContentLoaded', () => {
    const uploadFileInput = document.getElementById('upload-file-input'), selectButton = document.getElementById('select-button'), previewArea = document.getElementById('preview-area'), imagePreview = document.getElementById('image-preview'), uploadButton = document.getElementById('upload-button'), textQueryInput = document.getElementById('text-query'), textSearchButton = document.getElementById('text-search-button'), statusArea = document.getElementById('status-area'), resultsSection = document.getElementById('results-section'), resultsGrid = document.getElementById('results-grid'), statsChart = document.getElementById('stats-chart');
    let currentUploadFile = null;
    selectButton.addEventListener('click', () => uploadFileInput.click());
    uploadFileInput.addEventListener('change', (event) => handleFileSelect(event));
    uploadButton.addEventListener('click', handleUpload);
    textSearchButton.addEventListener('click', handleTextSearch);
    fetchStats();
    resultsGrid.addEventListener('click', function(event) { if (event.target && event.target.classList.contains('copy-button')) { const promptText = event.target.previousElementSibling.textContent; navigator.clipboard.writeText(promptText).then(() => { event.target.textContent = '복사 완료!'; setTimeout(() => { event.target.textContent = 'Veo3 프롬프트 복사'; }, 2000); }); } });
    function renderStatsChart(data) {
        if (!statsChart) return; statsChart.innerHTML = '';
        if (Object.keys(data).length === 0) { statsChart.innerHTML = '<p style="text-align:center; color:#999;">표시할 통계 데이터가 없습니다.</p>'; return; }
        const maxValue = Math.max(...Object.values(data));
        const sortedData = Object.entries(data).sort(([,a],[,b]) => b-a);
        const colors = ['#e50914', '#f6121d', '#b40710', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#34495e', '#1abc9c'];
        sortedData.forEach(([label, value], index) => {
            const barWidth = (value / maxValue) * 100;
            const barColor = colors[index % colors.length];
            const chartBar = document.createElement('div');
            chartBar.className = 'chart-bar-wrapper';
            chartBar.style.animationDelay = `${index * 0.05}s`;
            chartBar.innerHTML = ` <div class="bar-label" title="${label}">${label}</div> <div class="bar-container"> <div class="bar" style="width: ${barWidth}%; background: ${barColor};"> <span class="bar-value">${value}</span> </div> </div> `;
            statsChart.appendChild(chartBar);
        });
    }
    async function fetchStats() { try { const response = await callOrchestrator({ action: 'get_stats' }, '', true); renderStatsChart(response); } catch (error) { if (statsChart) { statsChart.innerHTML = `<p style="color: #e74c3c;">통계 데이터를 불러오는 데 실패했습니다.</p>`; } console.error(error); } }
    async function handleUpload() { if (!currentUploadFile) return; await callOrchestrator({ action: 'upload', image_data: currentUploadFile }, '자산 등록 및 AI 분석 중...'); await fetchStats(); }
    async function handleTextSearch() { const query = textQueryInput.value; if (!query) return; await callOrchestrator({ action: 'search', text_query: query }, `"${query}" 검색 중...`); }
    async function callOrchestrator(payload, statusMessage, isSilent = false) {
        if (!isSilent) showLoading(statusMessage);
        try {
            if (!CLOUD_FUNCTION_URL) { throw new Error("Cloud Function URL이 설정되지 않았습니다."); }
            const response = await fetch(CLOUD_FUNCTION_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || '알 수 없는 서버 오류');
            if (payload.action === 'get_stats') return data;
            if (payload.action === 'upload') { showSuccess(data.message); }
            else if (payload.action === 'search') { renderResults(data); }
        } catch (error) { if (!isSilent) showError(`오류 발생: ${error.message}`); throw error; }
    }
    function handleFileSelect(event) { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { currentUploadFile = e.target.result; imagePreview.src = e.target.result; previewArea.classList.remove('hidden'); uploadButton.disabled = false; }; reader.readAsDataURL(file); }
    function showLoading(message) { statusArea.innerHTML = `<div class="loader"></div><p>${message}</p>`; resultsSection.classList.add('hidden'); }
    function showSuccess(message) { statusArea.innerHTML = `<p style="color: #2ecc71; font-weight: bold;">✅ ${message}</p>`; }
    function showError(message) { statusArea.innerHTML = `<p style="color: #e74c3c; font-weight: bold;">🚨 ${message}</p>`; }
    function renderResults(results) {
        statusArea.innerHTML = ''; resultsGrid.innerHTML = ''; resultsSection.classList.remove('hidden');
        if (!Array.isArray(results) || results.length === 0) { resultsGrid.innerHTML = '<p>검색 결과가 없습니다.</p>'; } else {
            results.forEach(item => {
                const httpUrl = `https://storage.googleapis.com/${item.image_path.replace('gs://', '')}`;
                const resultItem = document.createElement('div');
                resultItem.className = 'result-item';
                let conceptsHtml = '<span style="color: #999;">태그 없음</span>';
                if (Array.isArray(item.concepts) && item.concepts.length > 0) { conceptsHtml = item.concepts.map(tag => `<span class="concept-tag">${tag}</span>`).join(' '); }
                const createdAt = item.created_at ? new Date(item.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '정보 없음';
                resultItem.innerHTML = ` <img src="${httpUrl}" alt="${item.alt_text || item.product_type || 'Uploaded Image'}"> <div class="info"> <h3>${item.product_type || 'N/A'}</h3> <ul class="metadata-list"> <li><span class="label">Asset ID</span><span class="value asset-id-value">${item.asset_id || '정보 없음'}</span></li> <li><span class="label">색상</span><span class="value">${item.color || '정보 없음'}</span></li> <li><span class="label">생성일</span><span class="value">${createdAt}</span></li> <li><span class="label">컨셉 태그</span><span class="value"><div class="concept-tags">${conceptsHtml}</div></span></li> <li><span class="label">AI 추천 마케팅 카피</span><span class="value marketing-copy-value">${item.marketing_copy || '정보 없음'}</span></li> <li><span class="label">✨ AI 영상 제작 프롬프트 (Veo3 Ready)</span><div class="veo-prompt-wrapper"><pre class="veo-prompt-value">${item.veo_prompt || '생성된 프롬프트가 없습니다.'}</pre><button class="copy-button primary-button" data-veo-prompt="${item.veo_prompt || ''}">Veo3 프롬프트 복사</button></div></li> <li><span class="label">추천 Alt Text</span><span class="value alt-text-value">${item.alt_text || '정보 없음'}</span></li> </ul> </div>`;
                resultsGrid.appendChild(resultItem);
            });
        }
    }
});
