#!/bin/bash
echo "Uploading static files..."
aws s3 cp static/upload.html s3://ifsf-chatbot-website-dev/

echo "Getting actual CloudFront URL..."
CLOUDFRONT_URL=$(aws cloudformation describe-stacks --stack-name ifsf-chatbot-dev --query 'Stacks[0].Outputs[?OutputKey==`WebsiteURL`].OutputValue' --output text)
echo "Upload page URL: $CLOUDFRONT_URL/upload.html"