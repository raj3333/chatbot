const AWS = require('aws-sdk');

const s3 = new AWS.S3();

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const { fileName, partnerId } = JSON.parse(event.body);
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
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      },
      body: JSON.stringify(presignedPost)
    };
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to generate upload URL' })
    };
  }
};