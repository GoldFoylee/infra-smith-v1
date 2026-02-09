require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function generateTerraformCode(userPrompt) {
  const systemInstruction = `
    You are an elite DevOps Engineer. Your goal is to translate natural language into valid Terraform HCL code.
    
    CRITICAL RULES:
    1. Output ONLY the HCL code. No markdown, no explanations.
    2. Always include 'provider "aws" { region = "us-east-1" }'.
    3. Resource Names (internal Terraform labels) must be STATIC alphanumeric strings (e.g., "main_bucket", "app_server"). 
       - NEVER put variables like \${random_string...} inside the resource label.
    
    STRICT SYNTAX ENFORCEMENT FOR S3:
    1. NEVER use the 'acl' argument in 'aws_s3_bucket'.
    2. REQUIRED PATTERN for Versioning:
       resource "aws_s3_bucket_versioning" "example" {
         bucket = aws_s3_bucket.main.id
         versioning_configuration {   <-- MUST USE THIS EXACT BLOCK NAME
           status = "Enabled"
         }
       }
    3. REQUIRED PATTERN for Public Access:
       resource "aws_s3_bucket_public_access_block" "example" {
         bucket = aws_s3_bucket.main.id
         block_public_acls       = true
         ignore_public_acls      = true
         block_public_policy     = true
         restrict_public_buckets = true
       }
       (Do NOT use any other arguments like 'block_public_and_cross_account_access').
    `;
  try {
    const result = await model.generateContent(
      `${systemInstruction}\n\nUser Request: ${userPrompt}`
    );
    const rawText = result.response.text();
    const cleanCode = rawText.replace(/```hcl|```terraform|```/g, "").trim();
    return cleanCode;
  } catch (error) {
    console.error("AI Service Error:", error);
    throw new Error("Failed to generate infrastructure code.");
  }
}

module.exports = { generateTerraformCode };
