const AWS = require('aws-sdk');
const pdf = require('pdf-parse');

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const bedrock = new AWS.BedrockRuntime({ region: 'us-east-1' });

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  try {
    const { question } = JSON.parse(event.body);
    console.log(`Searching for: ${question}`);
    
    // Get all documents
    const result = await dynamodb.scan({
      TableName: process.env.METADATA_TABLE
    }).promise();
    
    if (result.Items.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          answer: "No documents found. Please upload documents first.",
          sources: []
        })
      };
    }
    
    // Extract key search terms (remove common words)
    const keyWords = question.toLowerCase().split(' ').filter(word => 
      word.length > 2 && !['what', 'is', 'the', 'for', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'a', 'an', 'title', 'about', 'tell', 'me'].includes(word)
    );
    
    console.log(`Key search terms: ${keyWords.join(', ')}`);
    
    // Search through documents
    let foundContent = '';
    let sources = [];
    
    for (const doc of result.Items) {
      try {
        console.log(`Processing: ${doc.documentId}`);
        
        const s3Object = await s3.getObject({
          Bucket: process.env.DOCUMENTS_BUCKET,
          Key: doc.s3Key
        }).promise();
        
        // Extract text from PDF
        const pdfData = await pdf(s3Object.Body);
        const text = pdfData.text;
        
        console.log(`Extracted ${text.length} chars from ${doc.documentId}`);
        
        // Search for any key word in the text
        const textLower = text.toLowerCase();
        
        for (const word of keyWords) {
          if (textLower.includes(word)) {
            console.log(`Found '${word}' in ${doc.documentId}`);
            const index = textLower.indexOf(word);
            const start = Math.max(0, index - 600);
            const end = Math.min(text.length, index + 600);
            const context = text.substring(start, end);
            
            foundContent += `\n\nFrom ${doc.documentId}:\n${context}`;
            sources.push(doc.documentId);
            break; // Found in this document, move to next
          }
        }
        
      } catch (error) {
        console.error(`Error processing ${doc.documentId}:`, error);
      }
    }
    
    console.log(`Found content length: ${foundContent.length}`);
    
    if (!foundContent) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          answer: `I searched through ${result.Items.length} documents for "${question}" but couldn't find any matches. The terms may not be present in your uploaded documents.`,
          sources: result.Items.map(d => d.documentId),
          method: 'No matches found'
        })
      };
    }
    
    // Use Bedrock to create a clean, structured summary
    const prompt = `You are a professional document analyst. Based on the following document content, provide a clear, well-structured answer to the user's question.

Document Content:
${foundContent}

User Question: ${question}

Instructions:
- Provide a clean, professional response
- Use clear headings and bullet points where appropriate
- Structure the information logically (Title, Purpose, Key Features, etc.)
- Only include information that is actually in the documents
- Make it easy to read and understand
- Don't include unnecessary technical details or raw text

Answer:`;

    try {
      console.log('Calling Bedrock for analysis...');
      const response = await bedrock.invokeModel({
        modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
        body: JSON.stringify({
          anthropic_version: "bedrock-2023-05-31",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      }).promise();
      
      const bedrockResult = JSON.parse(response.body.toString());
      const answer = bedrockResult.content[0].text;
      
      console.log('Bedrock analysis completed successfully');
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          answer: answer,
          sources: sources,
          method: 'AI Document Analysis',
          documentsSearched: result.Items.length
        })
      };
      
    } catch (bedrockError) {
      console.error('Bedrock error:', bedrockError);
      
      // If Bedrock fails, provide a clean manual summary
      const cleanContent = foundContent.replace(/\n\nFrom [^:]+:/g, '\n\n').trim();
      const summary = cleanContent.length > 1000 ? cleanContent.substring(0, 1000) + '...' : cleanContent;
      
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          answer: `Based on your documents:\n\n${summary}`,
          sources: sources,
          method: 'Manual summary (AI unavailable)'
        })
      };
    }
    
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
      body: JSON.stringify({
        answer: `Error processing your question: ${error.message}`,
        sources: [],
        method: 'Error occurred'
      })
    };
  }
};