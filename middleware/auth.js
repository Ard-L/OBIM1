function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/");
    }
    next();
}

function requireAdmin(req, res, next) {
    if (
        !req.session.user ||
        req.session.user.role !== "admin"
    ) {
        return res.status(403).send("Access denied.");
    }
    next();
}

function requireCustomer(req, res, next) {
    if (
        !req.session.user ||
        req.session.user.role !== "customer"
    ) {
        return res.status(403).send("Access denied.");
    }
    next();
}

module.exports = {
    requireLogin,
    requireAdmin,
    requireCustomer
};
