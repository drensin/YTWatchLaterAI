/**
 * @fileoverview This file defines a function to report web vital metrics.
 * It uses the 'web-vitals' library to gather performance data.
 */

/**
 * Reports web vitals to the provided callback.
 * Dynamically imports the 'web-vitals' library and calls its metric functions.
 * @param {Function} [onPerfEntry] - Callback function to handle performance entries.
 */
const reportWebVitals = (onPerfEntry) => {
  if (onPerfEntry && onPerfEntry instanceof Function) {
    import('web-vitals').then(({getCLS, getFID, getFCP, getLCP, getTTFB}) => {
      getCLS(onPerfEntry);
      getFID(onPerfEntry);
      getFCP(onPerfEntry);
      getLCP(onPerfEntry);
      getTTFB(onPerfEntry);
    });
  }
};

export default reportWebVitals;
