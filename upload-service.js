const express = require('express');
const FormData = require('form-data');
const axios = require('axios');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/upload', async (req, res) => {
  try {
    const { taskId, filename, fileContent, mimeType, authorization } = req.body;

    if (!taskId || !filename || !fileContent || !authorization) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: taskId, filename, fileContent, authorization' 
      });
    }

    // Decode base64 file content
    const buffer = Buffer.from(fileContent, 'base64');

    // Create form data
    const formData = new FormData();
    formData.append('attachment', buffer, {
      filename: filename,
      contentType: mimeType || 'text/csv'
    });

    // Upload to ClickUp
    const response = await axios.post(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'Authorization': authorization
        }
      }
    );

    res.json({
      success: true,
      status: response.status,
      attachment: response.data
    });

  } catch (error) {
    console.error('Upload error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      status: error.response?.status
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Upload service running on port ${PORT}`);
});
