/**
 * Which link targets a message may open.
 *
 * Only http and https: a markdown link could otherwise point at `javascript:` or a Sense client route
 * and navigate the client away. The body's link component and the markdown projection both ask here,
 * so a highlight is treated as part of a link exactly when the link really opens.
 */

/**
 * Tell whether a link target may be opened.
 *
 * @param {*} href - The link target.
 * @returns {boolean} True for an absolute http or https URL.
 */
export function isSafeHref(href) {
    return typeof href === 'string' && /^https?:\/\//i.test(href);
}
