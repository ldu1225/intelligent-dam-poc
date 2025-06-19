import functions_framework, vertexai, uuid, os, json
from vertexai.generative_models import GenerativeModel
from google.cloud import aiplatform

PROJECT_ID = os.environ.get("GCP_PROJECT", "duleetest")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "")
LOCATION = os.environ.get("FUNCTION_REGION", "us-central1")

vertexai.init(project=PROJECT_ID, location=LOCATION)

@functions_framework.http
def veo_generator_service(request):
    headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json'}
    if request.method == 'OPTIONS': return ('', 204, headers)
    
    veo_prompt = request.get_json(silent=True).get('veo_prompt')
    if not veo_prompt: return (json.dumps({"error": "VEO2 prompt is missing."}), 400, headers)
    
    gcs_output_uri = f"gs://{BUCKET_NAME}/generated_videos/{uuid.uuid4()}/"
    print(f"--- VEO2 영상 생성 작업 시작 ---")
    print(f"  - 사용할 모델: veo-2.0-generate-001")
    print(f"  - 수신된 프롬프트: {veo_prompt}")
    
    try:
        model = GenerativeModel("veo-2.0-generate-001")
        operation = model.generate_content(
            [veo_prompt],
            generation_config={"mime_type": "video/mp4", "gcs_output_uri_prefix": gcs_output_uri, "duration_seconds": 8}, # 8초 영상
            stream=False
        )
        job_id = operation.operation.name.split('/')[-1]
        print(f"  - VEO2 작업 제출 성공. Job ID: {job_id}")
        return (json.dumps({
            "logs": [
                "[INFO] VEO2 작업 제출 성공.",
                f"[INFO] Job ID: {job_id}",
                f"[INFO] 결과물 버킷 위치: {gcs_output_uri}",
                "[INFO] Vertex AI '작업' 메뉴에서 이 Job ID로 상세 진행 상황을 추적할 수 있습니다.",
                "[SUCCESS] 모든 작업이 성공적으로 제출되었습니다."
            ],
            "jobId": job_id,
            "gcsOutputUri": gcs_output_uri
        }), 200, headers)
    except Exception as e:
        print(f"!!! VEO2 API 호출 실패: {e}")
        return (json.dumps({"error": f"VEO2 API 호출에 실패했습니다: {e}"}), 500, headers)
