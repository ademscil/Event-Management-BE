const express = require('express');
const multer = require('multer');
const {
  requireAuth,
  requirePermission
} = require('../middleware/authMiddleware');

const userController = require('../controllers/userController');
const businessUnitController = require('../controllers/businessUnitController');
const divisionController = require('../controllers/divisionController');
const departmentController = require('../controllers/departmentController');
const functionController = require('../controllers/functionController');
const applicationController = require('../controllers/applicationController');
const mappingController = require('../controllers/mappingController');
const surveyController = require('../controllers/surveyController');
const questionController = require('../controllers/questionController');
const responseController = require('../controllers/responseController');
const reportController = require('../controllers/reportController');
const approvalController = require('../controllers/approvalController');
const emailController = require('../controllers/emailController');
const auditController = require('../controllers/auditController');
const integrationController = require('../controllers/integrationController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Users
router.get('/users', requireAuth, requirePermission('users:read'), userController.getUsers);
router.get('/users/template', requireAuth, requirePermission('users:read'), userController.downloadUserTemplate);
router.get('/users/:id', requireAuth, requirePermission('users:read'), userController.getUserById);
router.post('/users', requireAuth, requirePermission('users:create'), userController.createUserValidation, userController.createUser);
router.put('/users/:id', requireAuth, requirePermission('users:update'), userController.updateUserValidation, userController.updateUser);
router.delete('/users/:id', requireAuth, requirePermission('users:delete'), userController.deactivateUser);
router.patch('/users/:id/ldap', requireAuth, requirePermission('users:update'), userController.toggleLDAPValidation, userController.toggleUserLDAP);
router.patch('/users/:id/password', requireAuth, requirePermission('users:update'), userController.setPasswordValidation, userController.setUserPassword);

// Master data
router.get('/business-units', requireAuth, requirePermission('master-data:read'), businessUnitController.getBusinessUnits);
router.get('/business-units/:id', requireAuth, requirePermission('master-data:read'), businessUnitController.getBusinessUnitById);
router.post('/business-units', requireAuth, requirePermission('master-data:create'), businessUnitController.createBusinessUnitValidation, businessUnitController.createBusinessUnit);
router.put('/business-units/:id', requireAuth, requirePermission('master-data:update'), businessUnitController.updateBusinessUnitValidation, businessUnitController.updateBusinessUnit);
router.delete('/business-units/:id', requireAuth, requirePermission('master-data:delete'), businessUnitController.deleteBusinessUnit);

router.get('/divisions', requireAuth, requirePermission('master-data:read'), divisionController.getDivisions);
router.get('/divisions/:id', requireAuth, requirePermission('master-data:read'), divisionController.getDivisionById);
router.post('/divisions', requireAuth, requirePermission('master-data:create'), divisionController.createDivisionValidation, divisionController.createDivision);
router.put('/divisions/:id', requireAuth, requirePermission('master-data:update'), divisionController.updateDivisionValidation, divisionController.updateDivision);
router.delete('/divisions/:id', requireAuth, requirePermission('master-data:delete'), divisionController.deleteDivision);

router.get('/departments', requireAuth, requirePermission('master-data:read'), departmentController.getDepartments);
router.get('/departments/:id', requireAuth, requirePermission('master-data:read'), departmentController.getDepartmentById);
router.post('/departments', requireAuth, requirePermission('master-data:create'), departmentController.createDepartmentValidation, departmentController.createDepartment);
router.put('/departments/:id', requireAuth, requirePermission('master-data:update'), departmentController.updateDepartmentValidation, departmentController.updateDepartment);
router.delete('/departments/:id', requireAuth, requirePermission('master-data:delete'), departmentController.deleteDepartment);

router.get('/functions', requireAuth, requirePermission('master-data:read'), functionController.getFunctions);
router.get('/functions/:id', requireAuth, requirePermission('master-data:read'), functionController.getFunctionById);
router.post('/functions', requireAuth, requirePermission('master-data:create'), functionController.createFunctionValidation, functionController.createFunction);
router.put('/functions/:id', requireAuth, requirePermission('master-data:update'), functionController.updateFunctionValidation, functionController.updateFunction);
router.delete('/functions/:id', requireAuth, requirePermission('master-data:delete'), functionController.deleteFunction);

router.get('/applications', requireAuth, requirePermission('master-data:read'), applicationController.getApplications);
router.get('/applications/:id', requireAuth, requirePermission('master-data:read'), applicationController.getApplicationById);
router.post('/applications', requireAuth, requirePermission('master-data:create'), applicationController.createApplicationValidation, applicationController.createApplication);
router.put('/applications/:id', requireAuth, requirePermission('master-data:update'), applicationController.updateApplicationValidation, applicationController.updateApplication);
router.delete('/applications/:id', requireAuth, requirePermission('master-data:delete'), applicationController.deleteApplication);

// Mappings
router.get('/mappings/function-application', requireAuth, requirePermission('mappings:read'), mappingController.getFunctionAppMappings);
router.post('/mappings/function-application', requireAuth, requirePermission('mappings:create'), mappingController.createFunctionAppMappingValidation, mappingController.createFunctionAppMapping);
router.delete('/mappings/function-application/:id', requireAuth, requirePermission('mappings:delete'), mappingController.deleteFunctionAppMapping);
router.get('/mappings/function-application/function/:functionId', requireAuth, requirePermission('mappings:read'), mappingController.getApplicationsByFunction);
router.get('/mappings/function-application/application/:applicationId', requireAuth, requirePermission('mappings:read'), mappingController.getFunctionsByApplication);
router.get('/mappings/function-application/export/csv', requireAuth, requirePermission('mappings:read'), mappingController.exportFunctionAppMappingsToCSV);

router.get('/mappings/application-department', requireAuth, requirePermission('mappings:read'), mappingController.getAppDeptMappings);
router.post('/mappings/application-department', requireAuth, requirePermission('mappings:create'), mappingController.createAppDeptMappingValidation, mappingController.createAppDeptMapping);
router.delete('/mappings/application-department/:id', requireAuth, requirePermission('mappings:delete'), mappingController.deleteAppDeptMapping);
router.get('/mappings/application-department/department/:departmentId', requireAuth, requirePermission('mappings:read'), mappingController.getApplicationsByDepartment);
router.get('/mappings/application-department/application/:applicationId', requireAuth, requirePermission('mappings:read'), mappingController.getDepartmentsByApplication);
router.get('/mappings/application-department/export/csv', requireAuth, requirePermission('mappings:read'), mappingController.exportAppDeptMappingsToCSV);
router.post('/mappings/bulk-import', requireAuth, requirePermission('mappings:create'), upload.single('file'), mappingController.bulkImportMappings);

// Backward-compatible mapping aliases used by current frontend
router.get('/mappings/function-app/details', requireAuth, requirePermission('mappings:read'), (req, res, next) => {
  req.query.detailed = 'true';
  return mappingController.getFunctionAppMappings(req, res, next);
});
router.post('/mappings/function-app', requireAuth, requirePermission('mappings:create'), mappingController.createFunctionAppMappingValidation, mappingController.createFunctionAppMapping);
router.get('/mappings/function-app/export', requireAuth, requirePermission('mappings:read'), mappingController.exportFunctionAppMappingsToCSV);
router.get('/mappings/app-dept/hierarchical', requireAuth, requirePermission('mappings:read'), (req, res, next) => {
  req.query.hierarchical = 'true';
  return mappingController.getAppDeptMappings(req, res, next);
});
router.post('/mappings/app-dept', requireAuth, requirePermission('mappings:create'), mappingController.createAppDeptMappingValidation, mappingController.createAppDeptMapping);
router.get('/mappings/app-dept/export', requireAuth, requirePermission('mappings:read'), mappingController.exportAppDeptMappingsToCSV);

// Surveys and questions
router.get('/surveys', requireAuth, requirePermission('surveys:read'), surveyController.getSurveys);
router.get('/surveys/:id', requireAuth, requirePermission('surveys:read'), surveyController.getSurveyById);
router.post('/surveys', requireAuth, requirePermission('surveys:create'), surveyController.createSurveyValidation, surveyController.createSurvey);
router.put('/surveys/:id', requireAuth, requirePermission('surveys:update'), surveyController.updateSurveyValidation, surveyController.updateSurvey);
router.delete('/surveys/:id', requireAuth, requirePermission('surveys:delete'), surveyController.deleteSurvey);
router.patch('/surveys/:id/config', requireAuth, requirePermission('surveys:update'), surveyController.updateSurveyConfig);
router.get('/surveys/:id/preview', requireAuth, requirePermission('surveys:read'), surveyController.generatePreview);
router.post('/surveys/:id/link', requireAuth, requirePermission('surveys:read'), surveyController.generateSurveyLink);
router.post('/surveys/:id/qrcode', requireAuth, requirePermission('surveys:read'), surveyController.generateQRCode);
router.post('/surveys/:id/embed', requireAuth, requirePermission('surveys:read'), surveyController.generateEmbedCode);
router.post('/surveys/:id/schedule-blast', requireAuth, requirePermission('surveys:update'), surveyController.scheduleBlast);
router.post('/surveys/:id/schedule-reminder', requireAuth, requirePermission('surveys:update'), surveyController.scheduleReminder);
router.get('/surveys/:id/scheduled-operations', requireAuth, requirePermission('surveys:read'), surveyController.getScheduledOperations);
router.delete('/surveys/scheduled-operations/:operationId', requireAuth, requirePermission('surveys:update'), surveyController.cancelScheduledOperation);
router.post('/surveys/:id/upload/hero', requireAuth, requirePermission('surveys:update'), surveyController.upload.single('image'), surveyController.uploadHeroImage);
router.post('/surveys/:id/upload/logo', requireAuth, requirePermission('surveys:update'), surveyController.upload.single('image'), surveyController.uploadLogo);
router.post('/surveys/:id/upload/background', requireAuth, requirePermission('surveys:update'), surveyController.upload.single('image'), surveyController.uploadBackgroundImage);

// Event aliases (naming transition from survey -> event)
router.get('/events', requireAuth, requirePermission('surveys:read'), surveyController.getSurveys);
router.get('/events/:id', requireAuth, requirePermission('surveys:read'), surveyController.getSurveyById);
router.post('/events', requireAuth, requirePermission('surveys:create'), surveyController.createSurveyValidation, surveyController.createSurvey);
router.put('/events/:id', requireAuth, requirePermission('surveys:update'), surveyController.updateSurveyValidation, surveyController.updateSurvey);
router.delete('/events/:id', requireAuth, requirePermission('surveys:delete'), surveyController.deleteSurvey);
router.patch('/events/:id/config', requireAuth, requirePermission('surveys:update'), surveyController.updateSurveyConfig);
router.get('/events/:id/preview', requireAuth, requirePermission('surveys:read'), surveyController.generatePreview);
router.post('/events/:id/link', requireAuth, requirePermission('surveys:read'), surveyController.generateSurveyLink);
router.post('/events/:id/qrcode', requireAuth, requirePermission('surveys:read'), surveyController.generateQRCode);
router.post('/events/:id/embed', requireAuth, requirePermission('surveys:read'), surveyController.generateEmbedCode);
router.post('/events/:id/schedule-blast', requireAuth, requirePermission('surveys:update'), surveyController.scheduleBlast);
router.post('/events/:id/schedule-reminder', requireAuth, requirePermission('surveys:update'), surveyController.scheduleReminder);
router.get('/events/:id/scheduled-operations', requireAuth, requirePermission('surveys:read'), surveyController.getScheduledOperations);

router.get('/questions/survey/:surveyId', requireAuth, requirePermission('surveys:read'), questionController.getQuestionsBySurvey);
router.post('/questions', requireAuth, requirePermission('surveys:update'), questionController.addQuestionValidation, questionController.addQuestion);
router.put('/questions/:id', requireAuth, requirePermission('surveys:update'), questionController.updateQuestionValidation, questionController.updateQuestion);
router.delete('/questions/:id', requireAuth, requirePermission('surveys:update'), questionController.deleteQuestion);
router.patch('/questions/reorder', requireAuth, requirePermission('surveys:update'), questionController.reorderQuestionsValidation, questionController.reorderQuestions);
router.post('/questions/:id/upload/image', requireAuth, requirePermission('surveys:update'), surveyController.upload.single('image'), questionController.uploadQuestionImage);
router.post('/questions/:id/upload/option/:optionIndex', requireAuth, requirePermission('surveys:update'), surveyController.upload.single('image'), questionController.uploadOptionImage);

// Public survey response endpoints
router.get('/responses/survey/:surveyId/form', responseController.getSurveyForm);
router.get('/responses/survey/:surveyId/applications', responseController.getAvailableApplications);
router.post('/responses/check-duplicate', responseController.checkDuplicateResponse);
router.post('/responses', responseController.submitResponseValidation, responseController.submitResponse);

// Response management
router.get('/responses', requireAuth, requirePermission('responses:read'), responseController.getResponses);
router.get('/responses/:id', requireAuth, requirePermission('responses:read'), responseController.getResponseById);
router.get('/responses/survey/:surveyId/statistics', requireAuth, requirePermission('responses:read'), responseController.getResponseStatistics);

// Reports
router.post('/reports/generate', requireAuth, requirePermission('reports:read'), reportController.generateReport);
router.post('/reports/before-takeout', requireAuth, requirePermission('reports:read'), reportController.generateBeforeTakeoutReport);
router.post('/reports/after-takeout', requireAuth, requirePermission('reports:read'), reportController.generateAfterTakeoutReport);
router.get('/reports/selection-list', requireAuth, requirePermission('reports:read'), reportController.getReportSelectionList);
router.get('/reports/takeout-comparison/:surveyId', requireAuth, requirePermission('reports:read'), reportController.getTakeoutComparisonTable);
router.get('/reports/department-head-review/:departmentId/:surveyId', requireAuth, requirePermission('reports:read'), reportController.getDepartmentHeadReview);
router.get('/reports/scores-by-function/:departmentId/:surveyId', requireAuth, requirePermission('reports:read'), reportController.getScoresByFunction);
router.get('/reports/approved-takeouts/:departmentId/:surveyId', requireAuth, requirePermission('reports:read'), reportController.getApprovedTakeouts);
router.post('/reports/export/excel', requireAuth, requirePermission('reports:export'), reportController.exportToExcel);
router.post('/reports/export/pdf', requireAuth, requirePermission('reports:export'), reportController.exportToPdf);
router.post('/reports/statistics', requireAuth, requirePermission('reports:read'), reportController.getAggregateStatistics);

// Approvals and best comments
router.post('/approvals/propose-takeout', requireAuth, requirePermission('responses:propose-takeout'), approvalController.proposeTakeoutForQuestion);
router.post('/approvals/bulk-propose-takeout', requireAuth, requirePermission('responses:propose-takeout'), approvalController.bulkProposeTakeout);
router.delete('/approvals/propose-takeout', requireAuth, requirePermission('responses:propose-takeout'), approvalController.cancelProposedTakeout);
router.post('/approvals/approve', requireAuth, requirePermission('approvals:approve'), approvalController.approveProposedTakeout);
router.post('/approvals/reject', requireAuth, requirePermission('approvals:reject'), approvalController.rejectProposedTakeout);
router.get('/approvals/pending', requireAuth, requirePermission('approvals:read'), approvalController.getPendingApprovals);
router.post('/approvals/best-comments', requireAuth, requirePermission('best-comments:create'), approvalController.markAsBestComment);
router.delete('/approvals/best-comments', requireAuth, requirePermission('best-comments:delete'), approvalController.unmarkBestComment);
router.get('/approvals/best-comments', requireAuth, requirePermission('best-comments:read'), approvalController.getBestComments);
router.post('/approvals/best-comments/feedback', requireAuth, requirePermission('best-comments:feedback'), approvalController.submitBestCommentFeedback);
router.get('/approvals/statistics/:surveyId', requireAuth, requirePermission('approvals:read'), approvalController.getApprovalStatistics);

// Emails
router.post('/emails/blast', requireAuth, requirePermission('emails:send'), emailController.sendSurveyBlast);
router.get('/emails/recipients/:surveyId', requireAuth, requirePermission('emails:send'), emailController.getTargetRecipients);
router.post('/emails/reminders', requireAuth, requirePermission('emails:send'), emailController.sendReminders);
router.get('/emails/non-respondents/:surveyId', requireAuth, requirePermission('emails:send'), emailController.getNonRespondents);
router.post('/emails/approval-notification', requireAuth, requirePermission('emails:send'), emailController.sendApprovalNotification);
router.post('/emails/rejection-notification', requireAuth, requirePermission('emails:send'), emailController.sendRejectionNotification);
router.get('/emails/templates/:templateName', requireAuth, requirePermission('emails:send'), emailController.getTemplate);

// Audit
router.get('/audit', requireAuth, requirePermission('audit:read'), auditController.getAuditLogs);
router.get('/audit/entity-history/:entityType/:entityId', requireAuth, requirePermission('audit:read'), auditController.getEntityHistory);
router.post('/audit/log', requireAuth, requirePermission('audit:read'), auditController.logAction);

// SAP integration
router.post('/integrations/sap/sync', requireAuth, requirePermission('sap:sync'), integrationController.triggerSAPSync);
router.get('/integrations/sap/sync/status', requireAuth, requirePermission('sap:sync'), integrationController.getSAPSyncStatus);
router.get('/integrations/sap/sync/history', requireAuth, requirePermission('sap:sync'), integrationController.getSAPSyncHistory);
router.get('/integrations/sap/test-connection', requireAuth, requirePermission('sap:sync'), integrationController.testSAPConnection);

module.exports = router;
