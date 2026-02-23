const { getTemplates, renderTemplate } = require('../services/emailTemplateService');

const listTemplates = async (req, res) => {
  try {
    return res.json({ success: true, data: getTemplates() });
  } catch (error) {
    console.error('Error listing templates:', error);
    return res.status(500).json({ success: false, message: 'Failed to load templates', error: error.message });
  }
};

const previewTemplate = async (req, res) => {
  try {
    const { code, vars = {} } = req.body || {};
    const rendered = renderTemplate(code, vars);
    if (!rendered) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }
    return res.json({ success: true, data: rendered });
  } catch (error) {
    console.error('Error rendering template:', error);
    return res.status(500).json({ success: false, message: 'Failed to render template', error: error.message });
  }
};

module.exports = {
  listTemplates,
  previewTemplate,
};

