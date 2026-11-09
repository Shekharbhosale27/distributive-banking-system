/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Format a number into Indian Rupee currency string using standard Indian numbering system (Lakhs & Crores)
 * Example: 485020 -> "₹4,85,020.00"
 * Example: 500000000 -> "₹50,00,00,000.00"
 */
export function formatINR(val: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '₹0.00';
  return val.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format large INR numbers into human-readable Lakhs and Crores
 * Example: 1842000 -> "₹18.42 Lakh"
 * Example: 500000000 -> "₹50.00 Cr"
 */
export function formatIndianCompact(val: number): string {
  if (typeof val !== 'number' || isNaN(val)) return '₹0';
  if (Math.abs(val) >= 10000000) {
    return `₹${(val / 10000000).toFixed(2)} Cr`;
  }
  if (Math.abs(val) >= 100000) {
    return `₹${(val / 100000).toFixed(2)} Lakh`;
  }
  return formatINR(val);
}

export function formatDate(isoString: string): string {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function maskAccount(accountNumber: string, prefix = '••••'): string {
  if (!accountNumber) return '••••';
  const last4 = accountNumber.slice(-4);
  return `${prefix} ${last4}`;
}
