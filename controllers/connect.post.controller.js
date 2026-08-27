const ConectionPost = require('../models/ConnectPost.model');
const Connection = require('../models/Connection.model');
const createNotification = require('../utils/create-notification');

// ============================================================
// GET USER POSTS (Based on their state)
// ============================================================
exports.getUserPosts = async (req, res) => {
  try {
    // Get user's connection
    const connection = await Connection.findOne({
      userId: req.user._id,
      userHasPaidConnectionFee: true,
    });

    if (!connection) {
      return res.status(403).json({
        message: 'Please connect first to view posts',
        requiresConnection: true,
      });
    }

    // Get posts for user's state + "All UK" posts
    const query = {
      isActive: true,
      $or: [
        { state: connection.state },
        { state: 'All UK' },
      ],
      expiresAt: { $gt: new Date() },
    };

    const posts = await ConectionPost.find(query)
      .populate('createdBy', 'fullName email')
      .sort({ isFeatured: -1, createdAt: -1 });

    res.json({
      data: posts,
      connection: {
        id: connection._id,
        state: connection.state,
        connectedAt: connection.createdAt,
      },
    });

  } catch (error) {
    console.error('❌ Get user posts error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADMIN: CREATE POST
// ============================================================
exports.createPost = async (req, res) => {
  try {
    const {
      title,
      content,
      type,
      state,
      venue,
      date,
      time,
      imageUrl,
      isFeatured,
      expiresAt,
      tags,
    } = req.body;

    const post = new Post({
      title,
      content,
      type: type || 'general',
      state,
      venue,
      date,
      time,
      imageUrl,
      isFeatured: isFeatured || false,
      expiresAt: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      tags: tags || [],
      createdBy: req.user._id,
    });

    await post.save();

    // Notify connected users in this state
    const connectedUsers = await Connection.find({
      state: state,
      userHasPaidConnectionFee: true,
      status: 'active',
    }).select('userId');

    for (const conn of connectedUsers) {
      await createNotification(
        conn.userId,
        'new_post',
        `📢 New ${type} in ${state}`,
        `${title} - ${content.substring(0, 100)}...`,
        {
          postId: post._id,
          state: state,
          type: type,
        }
      );
    }

    res.status(201).json({
      message: 'Post created successfully',
      data: post,
    });

  } catch (error) {
    console.error('❌ Create post error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADMIN: GET ALL POSTS
// ============================================================
exports.adminGetAllPosts = async (req, res) => {
  try {
    const { state, type, limit = 50, page = 1 } = req.query;
    
    const query = {};
    if (state) query.state = state;
    if (type) query.type = type;

    const posts = await ConectionPost.find(query)
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await ConectionPost.countDocuments(query);

    // Get stats
    const stats = {
      total: await ConectionPost.countDocuments(),
      byState: await ConectionPost.aggregate([
        { $group: { _id: '$state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      byType: await ConectionPost.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    };

    res.json({
      data: posts,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });

  } catch (error) {
    console.error('❌ Admin get posts error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADMIN: UPDATE POST
// ============================================================
exports.adminUpdatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const post = await ConectionPost.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const allowedUpdates = [
      'title',
      'content',
      'type',
      'state',
      'venue',
      'date',
      'time',
      'imageUrl',
      'isActive',
      'isFeatured',
      'expiresAt',
      'tags',
    ];

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        post[key] = updates[key];
      }
    }

    await post.save();

    res.json({
      message: 'Post updated successfully',
      data: post,
    });

  } catch (error) {
    console.error('❌ Admin update post error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// ADMIN: DELETE POST
// ============================================================
exports.adminDeletePost = async (req, res) => {
  try {
    const { id } = req.params;

    const post = await ConectionPost.findById(id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    await post.deleteOne();

    res.json({
      message: 'Post deleted successfully',
    });

  } catch (error) {
    console.error('❌ Admin delete post error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// GET CONNECTION STATUS
// ============================================================
exports.getConnectionStatus = async (req, res) => {
  try {
    const connection = await Connection.findOne({
      userId: req.user._id,
      userHasPaidConnectionFee: true,
    });

    res.json({
      hasConnected: !!connection,
      connection: connection || null,
      state: connection?.state || null,
    });

  } catch (error) {
    console.error('❌ Get connection status error:', error);
    res.status(500).json({ message: error.message });
  }
};