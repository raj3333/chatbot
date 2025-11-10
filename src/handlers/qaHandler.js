const AWS = require('aws-sdk');

const bedrock = new AWS.BedrockRuntime();
const kendra = new AWS.Kendra({ region: process.env.KENDRA_REGION || 'us-east-1' });

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
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        answer: result.content[0].text,
        sources: searchResult.ResultItems.map(item => item.DocumentTitle)
      })
    };
  } catch (error) {
    console.error('Error in Q&A:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
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