#!/bin/bash
echo "Deploying IFSF Chatbot..."
npm run deploy:dev

echo "Uploading static files..."
aws s3 sync ./static s3://ifsf-chatbot-website-dev/

echo "Getting CloudFront URL..."
aws cloudformation describe-stacks --stack-name ifsf-chatbot-dev --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text