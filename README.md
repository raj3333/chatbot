# IFSF Chatbot - AI-Powered Document Analysis Platform

## Quick Start

### Prerequisites
- Node.js 18+
- AWS CLI configured
- Serverless Framework v3

### Installation
```bash
npm install
```

### Deployment
```bash
# Development
npm run deploy:dev

# Production
npm run deploy:prod
```

### Configuration
1. Create Kendra index manually in AWS Console
2. Store index ID in SSM: `/ifsf-chatbot/dev/kendra-index-id`
3. Update API_BASE URL in `static/upload.html`

### Architecture
- **Frontend**: S3 + CloudFront static hosting
- **API**: API Gateway + Lambda functions
- **AI/ML**: Amazon Bedrock + Kendra
- **Storage**: S3 documents + DynamoDB metadata

### Key Features
- PDF document upload and processing
- AI-powered document comparison
- Interactive Q&A via Bedrock
- Semantic search with Kendra
- Serverless architecture

### Endpoints
- `POST /presign` - Generate S3 upload URLs
- `POST /chat` - Q&A interface
- `GET /upload.html` - Upload interface

See `IMPLEMENTATION_PLAN.md` for complete documentation.# chatbot
