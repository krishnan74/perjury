// SPDX-License-Identifier: MIT
// Reads an agent's standing from its ENS text record. See docs/design.md §4.3.
pragma solidity 0.8.26;

import {IStandingReader} from "../interfaces/IPerjury.sol";

interface IExtendedResolver {
    /// @dev ENSIP-10. The ENSv2 Permissioned Resolver serves reads through this,
    ///      not through a direct text(bytes32,string) call — verified on-chain:
    ///      text(bytes32,string) and text(bytes,string) both revert, resolve() works.
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

/// @title ENSTextStandingReader
/// @notice Resolves reputation at witness-assignment time. Called from inside a
///         VRF callback, so it goes straight to the resolver rather than through
///         the Universal Resolver, avoiding a CCIP-read hop.
contract ENSTextStandingReader is IStandingReader {
    string public constant STANDING_KEY = "com.perjury.agent-standing";
    /// @dev Written by the namespace operator at issuance. Never by the tribunal,
    ///      and never by the agent itself — see docs/design.md §4.2.
    string public constant BINDING_KEY = "com.perjury.agent-address";

    IExtendedResolver public immutable resolver;

    constructor(IExtendedResolver resolver_) {
        resolver = resolver_;
    }

    /// @param node namehash, used to build the inner text() call
    /// @param dnsName DNS-encoded name, which resolve() addresses by
    /// @return standing the agent's score
    /// @return readable whether the record could actually be read
    /// @dev Returning a bare integer conflated "no record yet" with "could not
    ///      read", so a resolver outage read as standing zero — which is
    ///      eligible, and which silently erased negative standing. Everything
    ///      else in this protocol fails closed; so does this now.
    function standingOfNameChecked(bytes32 node, bytes calldata dnsName)
        public
        view
        returns (int256 standing, bool readable)
    {
        bytes memory inner = abi.encodeWithSignature("text(bytes32,string)", node, STANDING_KEY);
        (bool ok, bytes memory ret) = address(resolver).staticcall(
            abi.encodeWithSelector(IExtendedResolver.resolve.selector, dnsName, inner)
        );
        if (!ok || ret.length == 0) return (0, false);

        bytes memory encoded = abi.decode(ret, (bytes));
        // An empty record is a genuine zero: a newly registered agent.
        if (encoded.length == 0) return (0, true);
        return (_parse(abi.decode(encoded, (string))), true);
    }

    /// @notice The address this name was issued to, per the namespace operator.
    /// @dev Registration uses this to refuse an agent binding its reputation to a
    ///      name it was not issued. It is deliberately a TEXT record: the ENSv2
    ///      Permissioned Resolver implementation carries no addr()/setAddr() at
    ///      all — verified against the deployed bytecode — so forward resolution
    ///      is not available and an issuance record is the honest substitute.
    ///
    ///      This proves ISSUANCE, not self-sovereign ownership: it attests that
    ///      whoever controls `perjury.eth` bound this subname to this address.
    ///      For a namespace whose subnames it issues, that is the correct trust
    ///      model — and it is a permission, since the key is writable only by
    ///      the holder of a per-key SET_TEXT grant, which is neither the agents
    ///      nor the tribunal.
    /// @return bound the address the name was issued to
    /// @return readable whether the record could actually be read
    function boundAddressChecked(bytes32 node, bytes calldata dnsName)
        public
        view
        returns (address bound, bool readable)
    {
        bytes memory inner = abi.encodeWithSignature("text(bytes32,string)", node, BINDING_KEY);
        (bool ok, bytes memory ret) = address(resolver).staticcall(
            abi.encodeWithSelector(IExtendedResolver.resolve.selector, dnsName, inner)
        );
        if (!ok || ret.length == 0) return (address(0), false);

        bytes memory encoded = abi.decode(ret, (bytes));
        if (encoded.length == 0) return (address(0), false);
        return _parseAddress(abi.decode(encoded, (string)));
    }

    /// @dev Parses "0x" + 40 hex chars, case-insensitive. Anything else is not an
    ///      answer — a malformed record must not read as address(0) and be
    ///      mistaken for one.
    function _parseAddress(string memory s) internal pure returns (address, bool) {
        bytes memory b = bytes(s);
        if (b.length != 42 || b[0] != "0" || (b[1] != "x" && b[1] != "X")) return (address(0), false);
        uint160 out;
        for (uint256 i = 2; i < 42; ++i) {
            uint8 ch = uint8(b[i]);
            uint8 v;
            if (ch >= 48 && ch <= 57) v = ch - 48;
            else if (ch >= 97 && ch <= 102) v = ch - 87;
            else if (ch >= 65 && ch <= 70) v = ch - 55;
            else return (address(0), false);
            out = out * 16 + v;
        }
        if (out == 0) return (address(0), false);
        return (address(out), true);
    }

    function standingOfName(bytes32 node, bytes calldata dnsName) public view returns (int256) {
        (int256 standing,) = standingOfNameChecked(node, dnsName);
        return standing;
    }

    /// @dev IStandingReader entry point. Without the DNS name we cannot address
    ///      the record, so an unset name reads as zero standing — which is the
    ///      starting value, not a pass.
    function standingOf(bytes32) external pure returns (int256) {
        return 0;
    }

    function _parse(string memory s) internal pure returns (int256) {
        bytes memory b = bytes(s);
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
