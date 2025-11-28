const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');
const admin = require('firebase-admin');

const serviceAccount = require('./firebaseServiceKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DB_URL
});

const db = admin.database();
const app = express();
app.use(cors());
const upload = multer({ dest: '/tmp/' });

// Google OAuth2
const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);
oauth2Client.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });

const drive = google.drive({ version: 'v3', auth: oauth2Client });

// ======= Frontend HTML =======
const frontendHTML = `
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>YS18 Drive Panel</title>
<style>
body{font-family:Arial;background:#111;color:#fff;margin:0;text-align:center}
.card{max-width:95%;width:450px;margin:20px auto;padding:20px;background:#222;border-radius:12px;box-sizing:border-box}
input,button{padding:12px;margin:6px;border-radius:8px;border:none;font-size:16px;width:90%}
button{background:#00c3ff;color:#000;font-weight:bold;cursor:pointer}
button:hover{background:#10e7ff}
.previewBox{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-top:12px}
.prevItem{background:#181818;padding:6px;border-radius:10px;position:relative}
.prevItem img,video{width:100%;border-radius:10px}
.delBtn{position:absolute;top:5px;right:5px;background:#ff4040;color:#fff;border:none;padding:2px 6px;border-radius:6px;cursor:pointer;font-size:12px}
</style>
</head>
<body>
<div id="login" class="card">
<h2>Giriş Yap</h2>
<button onclick="googleLogin()">Google ile Giriş</button><br>
<button onclick="anonLogin()">Anonim Giriş</button>
</div>

<div id="panel" class="card" style="display:none">
<h2>YS18 Drive Panel</h2>
<input type="file" id="fileInput" multiple>
<button onclick="upload()">⬆ Yükle</button>
<div class="previewBox" id="preview"></div>
<button onclick="logout()">Çıkış</button>
</div>

<script src="https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/11.0.0/firebase-database.js"></script>

<script>
// Firebase config
const firebaseConfig = {
 apiKey: "AIzaSyAi8rVSmO-hE3yzhZZJzxbYyj1qVP8HyVI",
 authDomain: "yusufstudio18shopier.firebaseapp.com",
 databaseURL: "https://yusufstudio18shopier-default-rtdb.firebaseio.com",
 projectId: "yusufstudio18shopier"
};
firebase.initializeApp(firebaseConfig);
const auth=firebase.getAuth();
const db=firebase.getDatabase();
let currentUser=null;

// Login
function googleLogin(){
 const provider=new firebase.GoogleAuthProvider();
 firebase.signInWithPopup(auth,provider).then(res=>{
   currentUser=res.user;
   showPanel();
 }).catch(console.log);
}
function anonLogin(){
 firebase.signInAnonymously(auth).then(res=>{
   currentUser=res.user;
   showPanel();
 });
}

function showPanel(){
document.getElementById("login").style.display="none";
document.getElementById("panel").style.display="block";
loadFiles();
}

// Logout
function logout(){firebase.signOut(auth);location.reload();}

// Upload
async function upload(){
 const files=document.getElementById("fileInput").files;
 const preview=document.getElementById("preview");

 for(let f of files){
   let form=new FormData();
   form.append("file",f);
   form.append("uid",currentUser.uid);

   const res=await fetch("/api/upload",{method:"POST",body:form});
   const data=await res.json();
   if(data.link){
     const ref=db.ref("files/"+currentUser.uid).push();
     await ref.set({name:f.name, link:data.link, driveId:data.driveId});
   }
 }
}

// Load user files
function loadFiles(){
 const preview=document.getElementById("preview");
 const ref=db.ref("files/"+currentUser.uid);
 ref.on('value',snap=>{
   preview.innerHTML="";
   snap.forEach(s=>{
     const d=s.val();
     const div=document.createElement("div");
     div.className="prevItem";
     div.innerHTML=\`<img src="\${d.link}"><button class="delBtn" onclick='deleteFile("\${s.key}","\${d.driveId}",this)'>Sil</button>\`;
     preview.appendChild(div);
   });
 });
}

// Delete
async function deleteFile(key,driveId,btn){
 await fetch("/api/delete",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({uid:currentUser.uid,key,driveId})
 });
 btn.parentElement.remove();
}
</script>
</body>
</html>
`;

// ======= Routes =======

// Frontend route
app.get('/', (req, res) => res.send(frontendHTML));

// Upload route
app.post('/api/upload', upload.single('file'), async (req, res) => {
  const uid=req.body.uid;
  try {
    const fileMetadata = { name: req.file.originalname };
    const media = { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) };
    const file = await drive.files.create({ resource: fileMetadata, media: media, fields: 'id' });
    await drive.permissions.create({ fileId: file.data.id, requestBody: { role: 'reader', type: 'anyone' } });
    const link=`https://drive.google.com/uc?id=${file.data.id}`;
    fs.unlinkSync(req.file.path);
    res.json({ link, name: req.file.originalname, driveId:file.data.id });
  } catch(err){console.error(err); res.status(500).json({error:'Drive upload failed'});}
});

// Delete route
app.use(express.json());
app.post('/api/delete', async (req,res)=>{
  const {uid,key,driveId}=req.body;
  try{
    await drive.files.delete({fileId:driveId});
    await db.ref("files/"+uid+"/"+key).remove();
    res.json({success:true});
  }catch(err){console.error(err);res.status(500).json({error:'Delete failed'});}
});

// Export for Vercel
module.exports=app;
