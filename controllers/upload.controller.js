const { uploadToCloudinary } = require('../middleware/upload');

// Upload single file
exports.uploadSingle = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const fileUrl = await uploadToCloudinary(req.file.path, 'geobuy/uploads');

    res.json({
      message: 'File uploaded successfully',
      fileUrl,
      filename: req.file.filename,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Upload multiple files
exports.uploadMultiple = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const fileUrls = [];
    for (const file of req.files) {
      const url = await uploadToCloudinary(file.path, 'geobuy/uploads');
      fileUrls.push(url);
    }

    res.json({
      message: 'Files uploaded successfully',
      fileUrls,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Upload provider documents
exports.uploadProviderDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const fileUrls = {};
    const documentTypes = req.body.documentTypes || [];

    for (let i = 0; i < req.files.length; i++) {
      const url = await uploadToCloudinary(req.files[i].path, 'geobuy/provider-documents');
      const docType = documentTypes[i] || `document_${i + 1}`;
      fileUrls[docType] = url;
    }

    res.json({
      message: 'Documents uploaded successfully',
      fileUrls,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};