const AWS = require('aws-sdk');

const bedrock = new AWS.BedrockRuntime();
const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

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
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        comparison: result.content[0].text
      })
    };
  } catch (error) {
    console.error('Error comparing documents:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Comparison failed' })
    };
  }
};

async function getDocumentText(documentId) {
  const metadata = await dynamodb.get({
    TableName: process.env.METADATA_TABLE,
    Key: { documentId }
  }).promise();
  
  if (!metadata.Item) {
    throw new Error(`Document ${documentId} not found`);
  }
  
  const object = await s3.getObject({
    Bucket: process.env.DOCUMENTS_BUCKET,
    Key: metadata.Item.s3Key
  }).promise();
  
  return object.Body.toString();
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