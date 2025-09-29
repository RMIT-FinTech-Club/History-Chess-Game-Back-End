const EloManager = artifacts.require("EloManager");

module.exports = function (deployer) {
  deployer.deploy(EloManager);
}; 