# 🚀 Intelligent DAM PoC for HS Ad

## 1. Project Overview

This project is a Proof of Concept (PoC) for an **Intelligent Digital Asset Management (DAM)** system, built for **HS Ad** utilizing Google Cloud's generative AI technologies. It aims to automate the core processes of digital asset management and maximize the value of content.

This system goes beyond simple storage, automatically generating rich metadata, marketing ideas, and even video creation prompts, transforming the DAM into a proactive content strategy hub.

**Developed by Donguk Lee (dulee)**

---

## 2. Core Features

*   **🤖 AI-Powered Metadata Generation**: Automatically generates essential metadata upon image registration.
    -   Product Type, Color, Concepts Tags
    -   SEO-Optimized Alt Text (5+ sentences)
*   **💡 AI-Powered Content Idea Generation**:
    -   **Marketing Copy**: Creates catchy marketing slogans ready for campaigns.
    -   **VEO2 Prompts**: Generates detailed, 8-second video ad prompts for VEO2, complete with a Korean narration script (no subtitles).
*   **📊 Live Asset Dashboard**: Provides a real-time, "fancy" bar chart visualizing the status of registered assets by product type.
*   **🔍 Keyword-Based Search**: Enables accurate asset retrieval based on all AI-generated text data.
*   **✨ Professional UI/UX**: A sophisticated web interface that looks and feels like a professional analytics solution.

---

## 3. System Architecture

This system is built on a serverless architecture, primarily using Google Cloud services. The core workflow is orchestrated by a central Cloud Function.

    graph TD
        subgraph "User (Web Browser)"
            A["1. Image Upload & Analysis Request"]
            B["5. Keyword Search Request"]
        end

        subgraph "Google Cloud Platform"
            C{"Cloud Functions (Central Orchestrator)"}
            subgraph "AI Core"
                D["Vertex AI Gemini (Analysis & Content Creation)"]
            end
            subgraph "Data Storage"
                E["Cloud Storage (Image Files)"]
                F["BigQuery (All Metadata)"]
            end
        end

        subgraph "Final Result (UI)"
            K["4. Registration Success"]
            J["8. Search Results"]
        end

        A -- "HTTPS POST (Image)" --> C;
        B -- "HTTPS POST (Keyword)" --> C;
        
        C -- "2. Save Image" --> E;
        C -- "3. Request AI Analysis" --> D;
        D -- "Return Metadata JSON" --> C;
        C -- "Save All Metadata" --> F;
        C -- "Send Success Response" --> K;

        C -- "6. Send SQL Query" --> F;
        F -- "Return Search Results" --> C;
        C -- "Send JSON Data" --> J;
        
        style A fill:#f9f,stroke:#333,stroke-width:2px;
        style B fill:#f9f,stroke:#333,stroke-width:2px;
        style C fill:#4285F4,stroke:#fff,stroke-width:2px,color:#fff;
        style D fill:#34A853,stroke:#fff,stroke-width:2px,color:#fff;
        style E fill:#FBBC05,stroke:#fff,stroke-width:2px,color:#333;
        style F fill:#EA4335,stroke:#fff,stroke-width:2px,color:#fff;
        style J fill:#f9f,stroke:#333,stroke-width:2px;
        style K fill:#f9f,stroke:#333,stroke-width:2px;

---

## 4. Technology Stack

*   **Backend**: Cloud Functions (Python 3.12)
*   **AI Model**: Vertex AI - Gemini 2.0 Flash Pro
*   **Database**: BigQuery
*   **Storage**: Cloud Storage
*   **Frontend**: HTML5, CSS3, JavaScript (Vanilla)

---

## 5. Setup & Deployment Guide

This guide is based on the Google Cloud Shell environment.

### Step 1: GCP Environment Setup

    # Set Project ID
    export PROJECT_ID="duleetest"
    gcloud config set project $PROJECT_ID

    # Enable APIs
    gcloud services enable functions.googleapis.com storage.googleapis.com bigquery.googleapis.com aiplatform.googleapis.com cloudbuild.googleapis.com

    # Create GCS Bucket
    export BUCKET_NAME="hsad-final-assets-v2"
    gcloud storage buckets create gs://$BUCKET_NAME --location=US-CENTRAL1 --uniform-bucket-level-access
    gcloud storage buckets add-iam-policy-binding gs://$BUCKET_NAME --member="allUsers" --role="roles/storage.objectViewer"

    # Create BigQuery Dataset & Table
    export BIGQUERY_DATASET="hsad_final_catalog_v2"
    bq --location=US mk --dataset $PROJECT_ID:$BIGQUERY_DATASET
    bq mk --table $PROJECT_ID:$BIGQUERY_DATASET.assets \
        asset_id:STRING,product_type:STRING,color:STRING,image_path:STRING,created_at:TIMESTAMP,concepts:JSON,alt_text:STRING,marketing_copy:STRING,veo_prompt:STRING

    # Upload Logo Assets
    gsutil cp gs://cloud-samples-data/ai-solutions/hs-ad-logo/hsad.png gs://$BUCKET_NAME/hsad.png
    gsutil cp gs://cloud-samples-data/ai-solutions/hs-ad-logo/google_cloud.png gs://$BUCKET_NAME/google_cloud.png

### Step 2: Deploy Backend (Cloud Function)

Place all source files (`main.py`, `requirements.txt`, etc.) in your working directory.

    # Deploy the main Cloud Function
    gcloud functions deploy hsad-final-orchestrator-v3 \
        --gen2 \
        --runtime=python312 \
        --region=us-central1 \
        --source=. \
        --entry-point=dam_orchestrator_with_search \
        --trigger-http \
        --allow-unauthenticated \
        --memory=1Gi \
        --timeout=180s \
        --set-env-vars=BUCKET_NAME=hsad-final-assets-v2,BIGQUERY_DATASET=hsad_final_catalog_v2,BIGQUERY_TABLE=assets,MODEL_ID=gemini-2.0-flash-001

### Step 3: Connect Frontend to Backend

After deployment, inject the Cloud Function URL into the `script.js` file.

    # Get the function URL
    export CLOUD_FUNCTION_URL=$(gcloud functions describe hsad-final-orchestrator-v3 --gen2 --region=us-central1 --format="value(serviceConfig.uri)")

    # Replace the placeholder in script.js
    sed -i "s|const CLOUD_FUNCTION_URL = \"\";|const CLOUD_FUNCTION_URL = \"${CLOUD_FUNCTION_URL}\";|" script.js

### Step 4: Run the Demo

    # Start the local web server
    python3 -m http.server 8080
    
Access the web server via the "Web-preview" feature in Cloud Shell.
```---

#### **2단계: GitHub에 최종 코드 업로드**

이제 완벽하게 생성된 `README.md` 파일을 포함하여, 모든 최종 코드를 GitHub 저장소에 올립니다.

```bash
# --- [STEP 2] Cloud Shell에서 아래 코드를 한 줄씩 실행합니다. ---

# 2-1. 변경된 모든 파일을 스테이징합니다.
git add .

# 2-2. 변경 사항을 기록(커밋)합니다.
git commit -m "docs: Finalize README.md with complete setup guide and architecture"

# 2-3. GitHub 저장소로 코드를 푸시(업로드)합니다.
git push origin main

echo "🚀 [SUCCESS] 모든 코드가 GitHub 저장소에 성공적으로 업로드되었습니다!"
echo "👉 확인 URL: https://github.com/ldu1225/intelligent-dam-poc"
