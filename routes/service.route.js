const express = require('express');
const router = express.Router();
const Service = require('../models/Service.model');
const { authMiddleware, requireRole } = require('../middleware/auth.middleware');

// Get all services
router.get('/', async (req, res) => {
  try {
    const services = await Service.find({ isActive: true })
      .select('name category description basePrice pricePerKm estimatedTime icon isPopular')
      .sort({ isPopular: -1, name: 1 });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get service by ID
router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create service (admin only)
router.post('/', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const {
      name,
      category,
      description,
      basePrice,
      pricePerKm,
      minPrice,
      maxPrice,
      estimatedTime,
      icon,
      isActive,
      isPopular,
      requiresSpecialSkills,
      requiresDBS,
      serviceAreas,
      restrictions,
    } = req.body;

    const service = new Service({
      name,
      category,
      description,
      basePrice,
      pricePerKm: pricePerKm || 0,
      minPrice,
      maxPrice,
      estimatedTime,
      icon,
      isActive: isActive !== undefined ? isActive : true,
      isPopular: isPopular || false,
      requiresSpecialSkills: requiresSpecialSkills || false,
      requiresDBS: requiresDBS || false,
      serviceAreas: serviceAreas || [],
      restrictions: restrictions || [],
    });

    await service.save();

    res.status(201).json({
      message: 'Service created successfully',
      service,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update service (admin only)
router.put('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    Object.assign(service, req.body);
    await service.save();

    res.json({
      message: 'Service updated successfully',
      service,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete service (admin only)
router.delete('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }

    await service.deleteOne();
    res.json({ message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get services by category
router.get('/category/:category', async (req, res) => {
  try {
    const services = await Service.find({
      category: req.params.category,
      isActive: true,
    });

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get popular services
router.get('/popular', async (req, res) => {
  try {
    const services = await Service.find({
      isActive: true,
      isPopular: true,
    }).limit(8);

    res.json(services);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;