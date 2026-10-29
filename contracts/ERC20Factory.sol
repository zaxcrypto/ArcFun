// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleERC20 is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address owner
    ) ERC20(name, symbol) {
        _mint(owner, initialSupply);
    }
}

contract ERC20Factory {
    event TokenDeployed(
        address indexed tokenAddress,
        address indexed owner,
        string name,
        string symbol,
        uint256 totalSupply
    );

    function deployToken(
        string memory name,
        string memory symbol,
        uint256 totalSupply
    ) external returns (address) {
        SimpleERC20 token = new SimpleERC20(name, symbol, totalSupply, msg.sender);
        emit TokenDeployed(address(token), msg.sender, name, symbol, totalSupply);
        return address(token);
    }
}
