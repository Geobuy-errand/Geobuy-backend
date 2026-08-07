const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage (no local files)
const storage = multer.memoryStorage();

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/pdf',
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and PDF are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: fileFilter,
});

// Upload to Cloudinary from memory buffer
const uploadToCloudinary = (fileBuffer, folder = 'geobuy') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto',
        public_id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );
    
    // Convert buffer to stream and pipe to Cloudinary
    const readableStream = streamifier.createReadStream(fileBuffer);
    readableStream.pipe(uploadStream);
  });
};

// Upload file to Cloudinary
const uploadFile = async (file, folder = 'geobuy/errands') => {
  try {
    if (!file || !file.buffer) {
      throw new Error('No file buffer found');
    }

    // Upload to Cloudinary
    const url = await uploadToCloudinary(file.buffer, folder);
    return url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`File upload failed: ${error.message}`);
  }
};

// Upload multiple files
const uploadMultipleFiles = async (files, folder = 'geobuy/errands') => {
  try {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    const uploadPromises = files.map(file => uploadFile(file, folder));
    const urls = await Promise.all(uploadPromises);
    return urls;
  } catch (error) {
    console.error('Multiple files upload error:', error);
    throw new Error(`Multiple files upload failed: ${error.message}`);
  }
};

module.exports = { upload, uploadToCloudinary, uploadFile, uploadMultipleFiles };