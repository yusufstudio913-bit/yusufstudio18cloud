// backend.js
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
const upload = multer({ dest: 'uploads/' });

// Google OAuth2 Client
const CLIENT_ID = '672310254286-l4bu9vjlme5716c7ckrb78dbvrp2puaq.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://yusufstudio18cloud.vercel.app/oauth2callback'; // script ile aldığımız redirect
const REFRESH_TOKEN = 'BURAYA_REFRESH_TOKEN'; // script ile aldığın token

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Dosya yükleme endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const fileMetadata = { name: req.file.originalname };
    const media = { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    // Public yap
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const link = `https://drive.google.com/uc?id=${file.data.id}`;
    fs.unlinkSync(req.file.path); // geçici dosyayı sil
    res.json({ link, name: req.file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Drive upload failed' });
  }
});

app.listen(3000, () => console.log('Backend çalışıyor: http://localhost:3000'));
