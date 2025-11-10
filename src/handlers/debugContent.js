const AWS = require('aws-sdk');
const pdf = require('pdf-parse');

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,GET'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    // Get first document to debug
    const result = await dynamodb.scan({
      TableName: process.env.METADATA_TABLE,
      Limit: 1
    }).promise();
    
    if (result.Items.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          message: "No documents found"
        })
      };
    }
    
    const doc = result.Items[0];
    
    try {
      const s3Object = await s3.getObject({
        Bucket: process.env.DOCUMENTS_BUCKET,
        Key: doc.s3Key
      }).promise();
      
      // Extract text from PDF
      const pdfData = await pdf(s3Object.Body);
      const text = pdfData.text;
      
      // Show first 2000 characters and search for common terms
      const preview = text.substring(0, 2000);
      const hasHackathon = text.toLowerCase().includes('hackathon');
      const hasBugBot = text.toLowerCase().includes('bugbot');
      const hasCamlytics = text.toLowerCase().includes('camlytics');
      const hasHectronic = text.toLowerCase().includes('hectronic');
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          documentId: doc.documentId,
          textLength: text.length,
          preview: preview,
          searchResults: {
            hackathon: hasHackathon,
            bugbot: hasBugBot,
            camlytics: hasCamlytics,
            hectronic: hasHectronic
          },
          message: "Debug content extraction"
        })
      };
      
    } catch (error) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          error: error.message,
          documentId: doc.documentId,
          s3Key: doc.s3Key
        })
      };
    }
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};