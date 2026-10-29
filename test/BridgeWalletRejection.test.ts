import { expect } from "chai";
import { isUserWalletRejection } from "../src/lib/bridge/rejection-detector";

describe("Bridge Wallet Rejection Handling", function () {
  it("detects numeric EIP-1193 code 4001 as user rejection", function () {
    const err = { code: 4001, message: "User rejected the request." };
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("detects string code '4001' as user rejection", function () {
    const err = { code: "4001", message: "User rejected" };
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("detects nested cause code 4001", function () {
    const err = { cause: { code: 4001, message: "Rejected" } };
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("detects UserRejectedRequestError name", function () {
    const err = { name: "UserRejectedRequestError", message: "User denied transaction signature" };
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("detects provider phrases 'User denied transaction signature'", function () {
    const err = new Error("MetaMask Tx Signature: User denied transaction signature.");
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("detects provider phrase 'rejected the request'", function () {
    const err = new Error("Provider Error: Rejected the request by user.");
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("detects provider phrase 'Transaction cancelled by user'", function () {
    const err = new Error("Transaction cancelled by user.");
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("detects provider phrase 'ACTION_REJECTED'", function () {
    const err = { code: "ACTION_REJECTED", message: "action rejected" };
    expect(isUserWalletRejection(err)).to.be.true;
  });

  it("returns false for RPC / Network / Timeout errors", function () {
    expect(isUserWalletRejection(new Error("VERIFICATION_TIMEOUT"))).to.be.false;
    expect(isUserWalletRejection(new Error("RPC_ERROR: failed to fetch receipt"))).to.be.false;
    expect(isUserWalletRejection(new Error("Internal Server Error"))).to.be.false;
    expect(isUserWalletRejection({ status: 500, message: "Gateway Timeout" })).to.be.false;
  });

  it("returns false for null / undefined / empty inputs", function () {
    expect(isUserWalletRejection(null)).to.be.false;
    expect(isUserWalletRejection(undefined)).to.be.false;
    expect(isUserWalletRejection({})).to.be.false;
  });
});
