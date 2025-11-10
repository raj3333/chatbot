const AWS = require('aws-sdk');

const opensearch = new AWS.OpenSearch();

exports.handler = async (event) => {
  const { question } = JSON.parse(event.body);
  
  try {
    // Simple text search in DynamoDB for now
    const dynamodb = new AWS.DynamoDB.DocumentClient();
    const result = await dynamodb.scan({
      TableName: process.env.METADATA_TABLE,
      FilterExpression: 'contains(fileName, :query)',
      ExpressionAttributeValues: {
        ':query': question
      }
    }).promise();
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        results: result.Items,
        message: 'Basic search results (OpenSearch integration pending)'
      })
    };
  } catch (error) {
    console.error('Search error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Search failed' })
    };
  }
};