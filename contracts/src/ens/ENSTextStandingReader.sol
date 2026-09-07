// SPDX-License-Identifier: MIT
// Reads an agent's standing from its ENS text record. See docs/design.md §4.3.
pragma solidity 0.8.26;

import {IStandingReader, ITextResolver} from "../interfaces/IPerjury.sol";

contract ENSTextStandingReader is IStandingReader {
    // Vendor-prefixed per ENS team guidance for app-specific records.
    string public constant STANDING_KEY = "com.perjury.agent-standing";

    ITextResolver public immutable resolver;

    constructor(ITextResolver resolver_) {
        resolver = resolver_;
    }

    function standingOf(bytes32 node) external view returns (int256) {
        string memory raw = resolver.text(node, STANDING_KEY);
        bytes memory b = bytes(raw);
        if (b.length == 0) return 0;
        bool neg = b[0] == "-";
        int256 v;
        for (uint256 i = neg ? 1 : 0; i < b.length; ++i) {
            uint8 ch = uint8(b[i]);
            if (ch < 48 || ch > 57) return 0;
            v = v * 10 + int256(uint256(ch - 48));
        }
        return neg ? -v : v;
    }
}
