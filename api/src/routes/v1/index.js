const express = require('express');
const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const recordRoute = require('./record.route');
const qsccRoute = require('./qscc.route');
const consultationRoute = require('./consultation.route');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/records',
    route: recordRoute,
  },
  {
    path: '/consultations',
    route: consultationRoute,
  },
  {
    path: '/qscc',
    route: qsccRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
