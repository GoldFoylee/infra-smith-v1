require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { generateTerraformCode } = require("./services/aiService");

app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const WORKSPACES_DIR = path.join(__dirname, "workspaces");

if (!fs.existsSync(WORKSPACES_DIR)) {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

const runTerraform = (res, commandArgs, sessionPath) => {
  const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
  const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
  const AWS_REGION = process.env.AWS_REGION || "us-east-1";

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    res.status(500).send("[ERROR] AWS credentials are not set on the server.");
    return;
  }

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Transfer-Encoding", "chunked");

  const dockerArgs = [
    "run",
    "--rm",
    "-v",
    `${sessionPath}:/workspace`,
    "-w",
    "/workspace",
    "-e",
    `AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}`,
    "-e",
    `AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}`,
    "-e",
    `AWS_REGION=${AWS_REGION}`,
    "--entrypoint",
    "/bin/sh",
    "infrasmith-runner",
    "-c",
    commandArgs,
  ];

  const child = spawn("docker", dockerArgs);

  child.stdout.on("data", (chunk) => res.write(chunk));
  child.stderr.on("data", (chunk) => res.write(chunk));

  child.on("close", (code) => {
    res.write(code === 0 ? "\n[SUCCESS]" : `\n[ERROR] Exit code ${code}`);
    res.end();
  });
};

const getSessionPath = (sessionId) => {
  const safeId = sessionId ? sessionId.replace(/[^a-z0-9]/gi, "_") : "default";
  const sessionPath = path.join(WORKSPACES_DIR, safeId);

  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }
  return sessionPath;
};

app.post("/generate", async (req, res) => {
  try {
    const code = await generateTerraformCode(req.body.prompt);
    res.json({ code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/deploy", (req, res) => {
  const { terraformCode, sessionId } = req.body;
  if (!terraformCode) {
    return res.status(400).send("[ERROR] No Terraform code provided.");
  }

  const sessionPath = getSessionPath(sessionId);
  fs.writeFileSync(path.join(sessionPath, "main.tf"), terraformCode);

  console.log(`[DEPLOY] Session: ${sessionId}`);
  runTerraform(
    res,
    "terraform init && terraform apply -auto-approve",
    sessionPath,
  );
});

app.post("/destroy", (req, res) => {
  const { sessionId } = req.body;
  const sessionPath = getSessionPath(sessionId);

  console.log(`[DESTROY] Session: ${sessionId}`);
  runTerraform(res, "terraform destroy -auto-approve", sessionPath);
});

app.listen(PORT, () => console.log(`InfraSmith running on ${PORT}`));
