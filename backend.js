// backend.js
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');
const admin = require('firebase-admin');

const serviceAccount = require('./firebaseServiceKey.json'); // Firebase service key

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://yusufstudio18shopier-default-rtdb.firebaseio.com"
});

const db = admin.database();
const app = express();
app.use(cors());
const upload = multer({ dest: 'uploads/' });

// Google OAuth2 Client
const CLIENT_ID = '672310254286-l4bu9vjlme5716c7ckrb78dbvrp2puaq.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const REFRESH_TOKEN = 'BURAYA_REFRESH_TOKEN';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  const uid = req.body.uid;
  try {
    const fileMetadata = { name: req.file.originalname };
    const media = { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) };

    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id',
    });

    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    const link = `https://drive.google.com/uc?id=${file.data.id}`;
    fs.unlinkSync(req.file.path);

    // Realtime DB kaydı
    const ref = db.ref("files/" + uid).push();
    await ref.set({ name: req.file.originalname, link, driveId: file.data.id });

    res.json({ link, name: req.file.originalname, key: ref.key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Drive upload failed' });
  }
});

// Dosya silme endpoint
app.post('/delete', express.json(), async (req, res) => {
  const { uid, key, driveId } = req.body;
  try {
    await drive.files.delete({ fileId: driveId });
    await db.ref("files/" + uid + "/" + key).remove();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

app.listen(3000, () => console.log('Backend çalışıyor: http://localhost:3000'));
