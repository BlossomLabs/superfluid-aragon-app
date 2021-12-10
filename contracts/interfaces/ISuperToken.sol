pragma solidity ^0.4.24;

import "./ISuperfluidToken.sol";

contract ISuperToken is ISuperfluidToken {
    function selfMint(
        address account,
        uint256 amount,
        bytes userData
    ) external;

    function upgrade(uint256 amount) external;

    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address recipient, uint256 amount) external returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);

    function balanceOf(address account) external view returns (uint256 balance);
}
