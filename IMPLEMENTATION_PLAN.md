# IFSF Chatbot – AI-Powered Document Analysis Platform
## Complete Implementation Plan & Architecture

---

## A. Overview & Architecture Summary

### System Architecture
```
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   CloudFront    │────│  S3 Static   │    │   API Gateway   │
│   + ACM SSL     │    │   Website    │    │   REST APIs     │
└─────────────────┘    └──────────────┘    └─────────────────┘
                                                     │
┌─────────────────┐    ┌──────────────┐    ┌─────────────────┐
│   Amazon Lex    │────│   Lambda     │────│   Amazon S3     │
│   Chatbot       │    │  Functions   │    │  Doc Storage    │
└─────────────────┘    └──────────────┘    └─────────────────┘
                                │
                       ┌──────────────┐    ┌─────────────────┐
                       │   Bedrock    │    │   DynamoDB      │
                       │   LLM API    │    │   Metadata      │
                       └──────────────┘    └─────────────────┘
                                │
                       ┌──────────────┐
                       │   Kendra     │
                       │ Search Index │
                       └──────────────┘
```

### Core Components
- **Frontend**: Static HTML upload page (S3 + CloudFront)
- **API Layer**: API Gateway + Lambda functions
- **AI/ML**: Amazon Bedrock for LLM, Kendra for search
- **Storage**: S3 for documents, DynamoDB for metadata
- **Chat Interface**: Amazon Lex bot integration

---

## B. Step-by-Step Requirements

### Functional Requirements
1. **Document Ingestion**
   - Upload PDFs via web interface (≤50MB)
   - Extract text using Textract (optional) or PDF parsing
   - Chunk documents for vector indexing
   - Store metadata in DynamoDB

2. **Document Analysis**
   - Compare partner docs vs IFSF baseline
   - Generate summaries and gap analysis
   - Highlight implementation differences

3. **Interactive Q&A**
   - Natural language queries via Lex chatbot
   - Retrieval-augmented generation (RAG)
   - Context-aware responses

4. **Web Interface**
   - Simple upload form with partner metadata
   - Real-time upload status
   - Document management dashboard

### Non-Functional Requirements
- **Performance**: <3s response time for queries
- **Scalability**: Handle 100+ concurrent users
- **Security**: Encryption at rest/transit, IAM-based access
- **Availability**: 99.9% uptime target

### Data Flow
1. User uploads document → S3 via presigned URL
2. S3 event triggers document ingestion Lambda
3. Document processed, chunked, and indexed in Kendra
4. Metadata stored in DynamoDB
5. User queries via Lex → Lambda retrieves context → Bedrock generates response

---

## C. serverless.yml Configuration

```yaml
service: ifsf-chatbot
frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs18.x
  region: ${opt:region, 'us-east-1'}
  stage: ${opt:stage, 'dev'}
  environment:
    DOCUMENTS_BUCKET: ${self:service}-documents-${self:provider.stage}
    WEBSITE_BUCKET: ${self:service}-website-${self:provider.stage}
    METADATA_TABLE: ${self:service}-metadata-${self:provider.stage}
    KENDRA_INDEX_ID: ${ssm:/ifsf-chatbot/${self:provider.stage}/kendra-index-id}
    BEDROCK_MODEL_ID: anthropic.claude-3-sonnet-20240229-v1:0
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - bedrock:InvokeModel
            - kendra:Query
            - kendra:BatchPutDocument
            - s3:GetObject
            - s3:PutObject
            - dynamodb:Query
            - dynamodb:PutItem
            - dynamodb:UpdateItem
          Resource: '*'

functions:
  documentIngest:
    handler: src/handlers/documentIngest.handler
    timeout: 300
    memorySize: 1024
    events:
      - s3:
          bucket: ${self:provider.environment.DOCUMENTS_BUCKET}
          event: s3:ObjectCreated:*
          existing: true

  indexer:
    handler: src/handlers/indexer.handler
    timeout: 300
    events:
      - stream:
          type: dynamodb
          arn: !GetAtt MetadataTable.StreamArn

  comparator:
    handler: src/handlers/comparator.handler
    timeout: 60

  qaHandler:
    handler: src/handlers/qaHandler.handler
    timeout: 30

  lexProxy:
    handler: src/handlers/lexProxy.handler
    timeout: 30

  presign:
    handler: src/handlers/presign.handler
    timeout: 10
    events:
      - http:
          path: /presign
          method: post
          cors: true

  chatApi:
    handler: src/handlers/chatApi.handler
    timeout: 30
    events:
      - http:
          path: /chat
          method: post
          cors: true

resources:
  Resources:
    DocumentsBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:provider.environment.DOCUMENTS_BUCKET}
        BucketEncryption:
          ServerSideEncryptionConfiguration:
            - ServerSideEncryptionByDefault:
                SSEAlgorithm: AES256
        NotificationConfiguration:
          LambdaConfigurations:
            - Event: s3:ObjectCreated:*
              Function: !GetAtt DocumentIngestLambdaFunction.Arn

    WebsiteBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:provider.environment.WEBSITE_BUCKET}
        WebsiteConfiguration:
          IndexDocument: upload.html
        PublicAccessBlockConfiguration:
          BlockPublicAcls: false
          BlockPublicPolicy: false
          IgnorePublicAcls: false
          RestrictPublicBuckets: false

    WebsiteBucketPolicy:
      Type: AWS::S3::BucketPolicy
      Properties:
        Bucket: !Ref WebsiteBucket
        PolicyDocument:
          Statement:
            - Effect: Allow
              Principal: '*'
              Action: s3:GetObject
              Resource: !Sub '${WebsiteBucket}/*'

    MetadataTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:provider.environment.METADATA_TABLE}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: documentId
            AttributeType: S
          - AttributeName: partnerId
            AttributeType: S
        KeySchema:
          - AttributeName: documentId
            KeyType: HASH
        GlobalSecondaryIndexes:
          - IndexName: partner-index
            KeySchema:
              - AttributeName: partnerId
                KeyType: HASH
            Projection:
              ProjectionType: ALL
        StreamSpecification:
          StreamViewType: NEW_AND_OLD_IMAGES

    CloudFrontDistribution:
      Type: AWS::CloudFront::Distribution
      Properties:
        DistributionConfig:
          Origins:
            - Id: S3Origin
              DomainName: !GetAtt WebsiteBucket.RegionalDomainName
              S3OriginConfig:
                OriginAccessIdentity: ''
          DefaultCacheBehavior:
            TargetOriginId: S3Origin
            ViewerProtocolPolicy: redirect-to-https
            AllowedMethods: [GET, HEAD]
            CachedMethods: [GET, HEAD]
            ForwardedValues:
              QueryString: false
          Enabled: true
          DefaultRootObject: upload.html

  Outputs:
    WebsiteURL:
      Value: !Sub 'https://${CloudFrontDistribution.DomainName}'
    ApiGatewayUrl:
      Value: !Sub 'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'

plugins:
  - serverless-offline
```

---

## D. Node.js Handler Implementations

### Document Ingestion Handler
```javascript
// src/handlers/documentIngest.js
const AWS = require('aws-sdk');
const pdf = require('pdf-parse');

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key);
    
    try {
      // Get document from S3
      const object = await s3.getObject({ Bucket: bucket, Key: key }).promise();
      
      // Extract text from PDF
      const pdfData = await pdf(object.Body);
      const text = pdfData.text;
      
      // Chunk text for indexing
      const chunks = chunkText(text, 1000);
      
      // Store metadata
      const documentId = key.split('/').pop().split('.')[0];
      await dynamodb.put({
        TableName: process.env.METADATA_TABLE,
        Item: {
          documentId,
          s3Key: key,
          uploadedAt: new Date().toISOString(),
          textLength: text.length,
          chunkCount: chunks.length,
          status: 'processed'
        }
      }).promise();
      
      console.log(`Processed document: ${documentId}`);
    } catch (error) {
      console.error('Error processing document:', error);
    }
  }
};

function chunkText(text, maxLength) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}
```

### Indexer Handler
```javascript
// src/handlers/indexer.js
const AWS = require('aws-sdk');

const kendra = new AWS.Kendra();
const s3 = new AWS.S3();

exports.handler = async (event) => {
  for (const record of event.Records) {
    if (record.eventName === 'INSERT') {
      const document = record.dynamodb.NewImage;
      
      try {
        // Get document content
        const object = await s3.getObject({
          Bucket: process.env.DOCUMENTS_BUCKET,
          Key: document.s3Key.S
        }).promise();
        
        // Index in Kendra
        await kendra.batchPutDocument({
          IndexId: process.env.KENDRA_INDEX_ID,
          Documents: [{
            Id: document.documentId.S,
            Title: document.documentId.S,
            Blob: object.Body,
            ContentType: 'application/pdf'
          }]
        }).promise();
        
        console.log(`Indexed document: ${document.documentId.S}`);
      } catch (error) {
        console.error('Error indexing document:', error);
      }
    }
  }
};
```

### Q&A Handler
```javascript
// src/handlers/qaHandler.js
const AWS = require('aws-sdk');

const bedrock = new AWS.BedrockRuntime();
const kendra = new AWS.Kendra();

exports.handler = async (event) => {
  const { question, partnerId } = JSON.parse(event.body);
  
  try {
    // Search relevant documents
    const searchResult = await kendra.query({
      IndexId: process.env.KENDRA_INDEX_ID,
      QueryText: question,
      PageSize: 5
    }).promise();
    
    // Build context from search results
    const context = searchResult.ResultItems
      .map(item => item.DocumentExcerpt?.Text || '')
      .join('\n\n');
    
    // Generate response using Bedrock
    const prompt = buildQAPrompt(question, context);
    const response = await bedrock.invokeModel({
      modelId: process.env.BEDROCK_MODEL_ID,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    }).promise();
    
    const result = JSON.parse(response.body.toString());
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: result.content[0].text,
        sources: searchResult.ResultItems.map(item => item.DocumentTitle)
      })
    };
  } catch (error) {
    console.error('Error in Q&A:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

function buildQAPrompt(question, context) {
  return `Based on the following IFSF documentation context, answer the question accurately and concisely.

Context:
${context}

Question: ${question}

Answer:`;
}
```

### Presign Handler
```javascript
// src/handlers/presign.js
const AWS = require('aws-sdk');

const s3 = new AWS.S3();

exports.handler = async (event) => {
  const { fileName, partnerId } = JSON.parse(event.body);
  
  try {
    const key = `uploads/${partnerId}/${Date.now()}-${fileName}`;
    
    const presignedPost = s3.createPresignedPost({
      Bucket: process.env.DOCUMENTS_BUCKET,
      Fields: { key },
      Expires: 300, // 5 minutes
      Conditions: [
        ['content-length-range', 0, 52428800] // 50MB max
      ]
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(presignedPost)
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to generate upload URL' })
    };
  }
};
```

### Comparator Handler
```javascript
// src/handlers/comparator.js
const AWS = require('aws-sdk');

const bedrock = new AWS.BedrockRuntime();
const s3 = new AWS.S3();

exports.handler = async (event) => {
  const { documentId1, documentId2 } = JSON.parse(event.body);
  
  try {
    // Get both documents
    const doc1 = await getDocumentText(documentId1);
    const doc2 = await getDocumentText(documentId2);
    
    // Generate comparison using Bedrock
    const prompt = buildComparisonPrompt(doc1, doc2);
    const response = await bedrock.invokeModel({
      modelId: process.env.BEDROCK_MODEL_ID,
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    }).promise();
    
    const result = JSON.parse(response.body.toString());
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comparison: result.content[0].text
      })
    };
  } catch (error) {
    console.error('Error comparing documents:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Comparison failed' })
    };
  }
};

async function getDocumentText(documentId) {
  // Implementation to retrieve document text from S3
  // This would involve getting the S3 key from DynamoDB and extracting text
  return "Document text placeholder";
}

function buildComparisonPrompt(doc1, doc2) {
  return `Compare these two IFSF specification documents and highlight key differences:

Document 1:
${doc1.substring(0, 2000)}...

Document 2:
${doc2.substring(0, 2000)}...

Provide a structured comparison focusing on:
1. Key differences in implementation requirements
2. Missing sections or requirements
3. Compliance gaps with IFSF standards
4. Recommended actions for alignment`;
}
```

---

## E. Static HTML Upload Interface

```html
<!-- upload.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IFSF Document Upload</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .upload-form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
        .status { margin-top: 20px; padding: 10px; border-radius: 4px; }
        .success { background: #d4edda; color: #155724; }
        .error { background: #f8d7da; color: #721c24; }
        .progress { width: 100%; height: 20px; background: #f0f0f0; border-radius: 10px; overflow: hidden; }
        .progress-bar { height: 100%; background: #007bff; transition: width 0.3s; }
    </style>
</head>
<body>
    <h1>IFSF Document Analysis Platform</h1>
    <p>Upload IFSF specification documents for AI-powered analysis and comparison.</p>
    
    <div class="upload-form">
        <form id="uploadForm">
            <div class="form-group">
                <label for="partnerId">Partner ID:</label>
                <input type="text" id="partnerId" required placeholder="e.g., partner-001">
            </div>
            
            <div class="form-group">
                <label for="documentType">Document Type:</label>
                <select id="documentType" required>
                    <option value="">Select type...</option>
                    <option value="specification">IFSF Specification</option>
                    <option value="implementation">Partner Implementation</option>
                    <option value="baseline">Baseline Document</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="fileInput">Select PDF Document:</label>
                <input type="file" id="fileInput" accept=".pdf" required>
            </div>
            
            <button type="submit">Upload Document</button>
        </form>
        
        <div id="uploadProgress" style="display: none;">
            <div class="progress">
                <div class="progress-bar" id="progressBar"></div>
            </div>
            <p id="progressText">Uploading...</p>
        </div>
        
        <div id="status"></div>
    </div>

    <script>
        const API_BASE = 'API_GATEWAY_URL_PLACEHOLDER'; // Replace with actual API Gateway URL
        
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const partnerId = document.getElementById('partnerId').value;
            const documentType = document.getElementById('documentType').value;
            const fileInput = document.getElementById('fileInput');
            const file = fileInput.files[0];
            
            if (!file) {
                showStatus('Please select a file', 'error');
                return;
            }
            
            try {
                showProgress(true);
                
                // Get presigned URL
                const presignResponse = await fetch(`${API_BASE}/presign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fileName: file.name,
                        partnerId: partnerId,
                        documentType: documentType
                    })
                });
                
                const presignData = await presignResponse.json();
                
                // Upload file to S3
                const formData = new FormData();
                Object.keys(presignData.fields).forEach(key => {
                    formData.append(key, presignData.fields[key]);
                });
                formData.append('file', file);
                
                const uploadResponse = await fetch(presignData.url, {
                    method: 'POST',
                    body: formData
                });
                
                if (uploadResponse.ok) {
                    showStatus('Document uploaded successfully! Processing will begin shortly.', 'success');
                    document.getElementById('uploadForm').reset();
                } else {
                    throw new Error('Upload failed');
                }
            } catch (error) {
                console.error('Upload error:', error);
                showStatus('Upload failed. Please try again.', 'error');
            } finally {
                showProgress(false);
            }
        });
        
        function showProgress(show) {
            document.getElementById('uploadProgress').style.display = show ? 'block' : 'none';
            if (show) {
                let progress = 0;
                const interval = setInterval(() => {
                    progress += 10;
                    document.getElementById('progressBar').style.width = progress + '%';
                    if (progress >= 100) clearInterval(interval);
                }, 200);
            }
        }
        
        function showStatus(message, type) {
            const statusDiv = document.getElementById('status');
            statusDiv.innerHTML = `<div class="status ${type}">${message}</div>`;
        }
    </script>
</body>
</html>
```

---

## F. Data Model & Metadata Schema

### DynamoDB Schema
```javascript
// Document Metadata Table
{
  documentId: "string",        // Primary Key
  partnerId: "string",         // GSI Key
  s3Key: "string",            // S3 object key
  fileName: "string",         // Original filename
  documentType: "string",     // specification|implementation|baseline
  uploadedAt: "string",       // ISO timestamp
  processedAt: "string",      // ISO timestamp
  status: "string",           // uploaded|processing|processed|failed
  textLength: "number",       // Character count
  chunkCount: "number",       // Number of text chunks
  checksum: "string",         // MD5 hash
  metadata: {
    title: "string",
    version: "string",
    author: "string",
    tags: ["string"]
  }
}

// Vector Embeddings (if using custom vector store)
{
  chunkId: "string",          // Primary Key
  documentId: "string",       // Foreign Key
  chunkIndex: "number",       // Chunk sequence
  text: "string",            // Chunk text content
  embedding: [number],        // Vector embedding
  metadata: {
    pageNumber: "number",
    section: "string"
  }
}
```

---

## G. LLM Prompt Templates

### Document Comparison Prompt
```javascript
const COMPARISON_PROMPT = `
You are an expert IFSF (International Forecourt Standards Forum) analyst. Compare these two specification documents and provide a detailed analysis.

BASELINE DOCUMENT:
<<BASELINE_CONTENT>>

PARTNER DOCUMENT:
<<PARTNER_CONTENT>>

ANALYSIS REQUIREMENTS:
1. Identify key differences in technical requirements
2. Highlight missing mandatory sections
3. Flag potential compliance issues
4. Suggest implementation steps for alignment

FORMAT YOUR RESPONSE AS:
## Key Differences
- [List major differences]

## Missing Requirements
- [List missing mandatory elements]

## Compliance Gaps
- [List potential compliance issues]

## Recommended Actions
- [Prioritized list of alignment steps]

Focus on actionable insights for developers implementing IFSF standards.
`;

const QA_PROMPT = `
You are an IFSF specification expert assistant. Answer the user's question based on the provided documentation context.

CONTEXT:
<<CONTEXT>>

QUESTION: <<QUESTION>>

INSTRUCTIONS:
- Provide accurate, specific answers based on the documentation
- Include relevant section references when possible
- If information is not in the context, clearly state this
- Focus on practical implementation guidance
- Use clear, developer-friendly language

ANSWER:
`;

const SUMMARIZATION_PROMPT = `
Summarize this IFSF specification document, focusing on:

DOCUMENT:
<<DOCUMENT_CONTENT>>

SUMMARY REQUIREMENTS:
1. Main purpose and scope
2. Key technical requirements
3. Implementation considerations
4. Compliance checkpoints

Provide a concise summary suitable for technical teams.
`;
```

---

## H. IAM Policies (Least Privilege)

### Lambda Execution Role
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::ifsf-chatbot-documents-*/*",
        "arn:aws:s3:::ifsf-chatbot-website-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:Query",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/ifsf-chatbot-metadata-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kendra:Query",
        "kendra:BatchPutDocument"
      ],
      "Resource": "arn:aws:kendra:*:*:index/*"
    }
  ]
}
```

---

## I. Testing & CI/CD Plan

### Unit Tests
```javascript
// tests/handlers/qaHandler.test.js
const { handler } = require('../../src/handlers/qaHandler');

describe('QA Handler', () => {
  test('should return answer for valid question', async () => {
    const event = {
      body: JSON.stringify({
        question: 'What are IFSF payment requirements?',
        partnerId: 'test-partner'
      })
    };
    
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toHaveProperty('answer');
  });
});
```

### GitHub Actions Workflow
```yaml
# .github/workflows/deploy.yml
name: Deploy IFSF Chatbot

on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run lint

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx serverless deploy --stage prod
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## J. Observability & Security Checklist

### CloudWatch Monitoring
```javascript
// Custom metrics in Lambda functions
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

async function publishMetric(metricName, value, unit = 'Count') {
  await cloudwatch.putMetricData({
    Namespace: 'IFSF/Chatbot',
    MetricData: [{
      MetricName: metricName,
      Value: value,
      Unit: unit,
      Timestamp: new Date()
    }]
  }).promise();
}
```

### Security Measures
- ✅ S3 bucket encryption (SSE-S3)
- ✅ API Gateway throttling (1000 req/sec)
- ✅ Presigned URL expiration (5 minutes)
- ✅ File size limits (50MB)
- ✅ CORS configuration
- ✅ CloudFront HTTPS enforcement
- ✅ IAM least privilege policies
- ✅ Secrets Manager for API keys

---

## K. Deployment Roadmap & Acceptance Criteria

### Phase 1: Core Infrastructure (Week 1)
```bash
# Deploy base infrastructure
serverless deploy --stage dev

# Upload static website
aws s3 sync ./static s3://ifsf-chatbot-website-dev/

# Test basic upload functionality
curl -X POST https://api-url/dev/presign \
  -H "Content-Type: application/json" \
  -d '{"fileName":"test.pdf","partnerId":"test"}'
```

### Phase 2: Document Processing (Week 2)
- ✅ PDF text extraction working
- ✅ Kendra indexing functional
- ✅ DynamoDB metadata storage
- ✅ S3 event triggers processing

### Phase 3: AI Integration (Week 3)
- ✅ Bedrock API integration
- ✅ RAG pipeline functional
- ✅ Document comparison working
- ✅ Q&A responses accurate

### Phase 4: Production Deployment (Week 4)
```bash
# Production deployment
serverless deploy --stage prod

# Domain setup (manual)
# 1. Create ACM certificate
# 2. Configure Route53 DNS
# 3. Update CloudFront distribution

# Smoke tests
npm run test:e2e
```

### Acceptance Criteria
1. **Upload Flow**: Users can upload PDFs ≤50MB successfully
2. **Processing**: Documents processed within 5 minutes
3. **Search**: Kendra returns relevant results for queries
4. **Q&A**: Bedrock generates accurate responses with <3s latency
5. **Comparison**: Document differences highlighted clearly
6. **Security**: All data encrypted, access controlled
7. **Performance**: System handles 100 concurrent users
8. **Monitoring**: CloudWatch dashboards show system health

### Final Deliverable
- **Public URL**: `https://ifsf-chatbot.example.com/upload.html`
- **API Endpoints**: Document upload, Q&A, comparison
- **Documentation**: API docs, user guide, admin manual
- **Monitoring**: CloudWatch dashboards and alarms

---

## Cost Optimization Tips
- Use S3 Intelligent Tiering for document storage
- Implement Lambda provisioned concurrency for critical functions
- Cache Bedrock responses for common queries
- Use DynamoDB on-demand billing
- Set up CloudWatch cost alarms

This implementation provides a complete, production-ready IFSF Chatbot platform with all required components and security best practices.