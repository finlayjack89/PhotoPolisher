/**
 * Comprehensive Test Suite for LuxSnap Compositing Engine
 * 
 * Tests critical functionality:
 * 1. Y-Axis Positioning - Full vertical range without snapping
 * 2. Preview-Export Parity - Consistent dimensions across scales
 * 3. Blur/Effect Scaling - Proportional scaling with REFERENCE_WIDTH
 * 4. Layout Calculations - computeCompositeLayout correctness
 */

import {
  REFERENCE_WIDTH,
  getScaledValue,
  computeCompositeLayout,
  type SubjectPlacement,
  type CompositeLayout,
} from './canvas-utils';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

const testResults: TestResult[] = [];

function runTest(name: string, testFn: () => void): void {
  try {
    testFn();
    testResults.push({ name, passed: true, details: 'All assertions passed' });
    console.log(`✅ ${name}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    testResults.push({ name, passed: false, details: 'Test failed', error: errorMsg });
    console.error(`❌ ${name}: ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertApproxEqual(actual: number, expected: number, tolerance: number, message: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
  }
}

/**
 * TEST SUITE 1: Y-AXIS POSITIONING
 * Verifies the floor-based positioning system works correctly across full Y range
 */

runTest('Y-Axis: REFERENCE_WIDTH is 3000', () => {
  assert(REFERENCE_WIDTH === 3000, `REFERENCE_WIDTH should be 3000, got ${REFERENCE_WIDTH}`);
});

runTest('Y-Axis: placement.y=1 positions subject at bottom', () => {
  const layout = computeCompositeLayout(
    1000, 1000, // canvas
    200, 200,   // shadow subject
    160, 180,   // clean subject
    { x: 0.5, y: 1, scale: 1 }
  );
  
  // Subject bottom should be at canvas bottom
  const subjectBottom = layout.shadowedSubjectRect.y + layout.shadowedSubjectRect.height;
  assertApproxEqual(subjectBottom, 1000, 1, 'Subject bottom should be at canvas bottom (y=1000)');
});

runTest('Y-Axis: placement.y=0.5 positions subject bottom at center', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    200, 200,
    160, 180,
    { x: 0.5, y: 0.5, scale: 1 }
  );
  
  // Subject bottom should be at canvas center
  const subjectBottom = layout.shadowedSubjectRect.y + layout.shadowedSubjectRect.height;
  assertApproxEqual(subjectBottom, 500, 1, 'Subject bottom should be at canvas center (y=500)');
});

runTest('Y-Axis: placement.y=0 positions subject above canvas (floor at top)', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    200, 200,
    160, 180,
    { x: 0.5, y: 0, scale: 1 }
  );
  
  // Subject should be entirely above canvas (y is negative)
  assert(layout.shadowedSubjectRect.y < 0, 'Subject y should be negative when placement.y=0');
  const subjectBottom = layout.shadowedSubjectRect.y + layout.shadowedSubjectRect.height;
  assertApproxEqual(subjectBottom, 0, 1, 'Subject bottom should be at canvas top (y=0)');
});

runTest('Y-Axis: Continuous positioning without snapping', () => {
  const yPositions = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  let previousY = -Infinity;
  
  for (const y of yPositions) {
    const layout = computeCompositeLayout(
      1000, 1000,
      200, 200,
      160, 180,
      { x: 0.5, y, scale: 1 }
    );
    
    // Y should always increase as placement.y increases
    assert(layout.shadowedSubjectRect.y > previousY, 
      `Y position should increase monotonically: at placement.y=${y}, got y=${layout.shadowedSubjectRect.y}`);
    previousY = layout.shadowedSubjectRect.y;
  }
});

/**
 * TEST SUITE 2: PREVIEW-EXPORT PARITY
 * Verifies proportional scaling maintains consistent positioning
 */

runTest('Parity: getScaledValue returns proportional values', () => {
  // At reference width, value should be unchanged
  const atReference = getScaledValue(9, 3000);
  assertApproxEqual(atReference, 9, 0.01, 'At REFERENCE_WIDTH, value should be 9');
  
  // At half reference, value should be halved
  const atHalf = getScaledValue(9, 1500);
  assertApproxEqual(atHalf, 4.5, 0.01, 'At half REFERENCE_WIDTH, value should be 4.5');
  
  // At double reference, value should be doubled
  const atDouble = getScaledValue(9, 6000);
  assertApproxEqual(atDouble, 18, 0.01, 'At double REFERENCE_WIDTH, value should be 18');
});

runTest('Parity: getScaledValue respects minimum value', () => {
  // Very small canvas should return minimum, not zero
  const verySmall = getScaledValue(9, 10);
  assert(verySmall >= 0.5, 'Scaled value should not go below default minimum (0.5)');
  
  // Custom minimum should be respected
  const customMin = getScaledValue(9, 10, 2.0);
  assertApproxEqual(customMin, 2.0, 0.01, 'Custom minimum should be respected');
});

runTest('Parity: Preview and export use same proportional layout', () => {
  const placement: SubjectPlacement = { x: 0.5, y: 0.85, scale: 0.8 };
  
  // Preview: 600px canvas (1/5 of export)
  const previewScale = 600 / 3000;
  const previewLayout = computeCompositeLayout(
    600, 600,
    1400 * previewScale, 1400 * previewScale,
    1000 * previewScale, 1200 * previewScale,
    placement
  );
  
  // Export: 3000px canvas (full size)
  const exportLayout = computeCompositeLayout(
    3000, 3000,
    1400, 1400,
    1000, 1200,
    placement
  );
  
  // Proportional positions should match
  const previewXRatio = previewLayout.shadowedSubjectRect.x / 600;
  const exportXRatio = exportLayout.shadowedSubjectRect.x / 3000;
  assertApproxEqual(previewXRatio, exportXRatio, 0.01, 'X position ratio should match');
  
  const previewYRatio = previewLayout.shadowedSubjectRect.y / 600;
  const exportYRatio = exportLayout.shadowedSubjectRect.y / 3000;
  assertApproxEqual(previewYRatio, exportYRatio, 0.01, 'Y position ratio should match');
});

runTest('Parity: Width and height ratios match between preview and export', () => {
  const placement: SubjectPlacement = { x: 0.5, y: 1, scale: 1.2 };
  
  // Preview
  const previewLayout = computeCompositeLayout(
    600, 450,
    280, 280,
    200, 240,
    placement
  );
  
  // Export (5x larger)
  const exportLayout = computeCompositeLayout(
    3000, 2250,
    1400, 1400,
    1000, 1200,
    placement
  );
  
  // Subject size as proportion of canvas should match
  const previewWidthRatio = previewLayout.shadowedSubjectRect.width / 600;
  const exportWidthRatio = exportLayout.shadowedSubjectRect.width / 3000;
  assertApproxEqual(previewWidthRatio, exportWidthRatio, 0.01, 'Width ratio should match');
  
  const previewHeightRatio = previewLayout.shadowedSubjectRect.height / 450;
  const exportHeightRatio = exportLayout.shadowedSubjectRect.height / 2250;
  assertApproxEqual(previewHeightRatio, exportHeightRatio, 0.01, 'Height ratio should match');
});

/**
 * TEST SUITE 3: BLUR/EFFECT SCALING
 * Verifies blur effects scale correctly with canvas size
 */

runTest('Blur: DoF base value (9px) at reference width', () => {
  const dofBlur = getScaledValue(9, 3000);
  assertApproxEqual(dofBlur, 9, 0.01, 'DoF blur at 3000px should be 9px');
});

runTest('Blur: Reflection base value (4px) at reference width', () => {
  const reflectionBlur = getScaledValue(4, 3000);
  assertApproxEqual(reflectionBlur, 4, 0.01, 'Reflection blur at 3000px should be 4px');
});

runTest('Blur: Contact shadow base value (8px) at reference width', () => {
  const contactBlur = getScaledValue(8, 3000);
  assertApproxEqual(contactBlur, 8, 0.01, 'Contact shadow blur at 3000px should be 8px');
});

runTest('Blur: Preview blur is 1/5 of export blur', () => {
  // At 600px preview (1/5 of 3000px)
  const previewDof = getScaledValue(9, 600);
  const expectedPreviewDof = 9 * (600 / 3000);
  assertApproxEqual(previewDof, expectedPreviewDof, 0.01, 'Preview DoF should be 1.8px');
  
  const previewReflection = getScaledValue(4, 600);
  const expectedPreviewReflection = 4 * (600 / 3000);
  assertApproxEqual(previewReflection, expectedPreviewReflection, 0.01, 'Preview reflection should be 0.8px');
});

/**
 * TEST SUITE 4: LAYOUT CALCULATIONS
 * Verifies computeCompositeLayout produces correct output
 */

runTest('Layout: Product rect is centered within shadow rect', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    300, 300,  // Shadow is 300x300 (has padding)
    200, 200,  // Clean is 200x200 (actual product)
    { x: 0.5, y: 1, scale: 1 }
  );
  
  // Product should be centered within shadow (50px padding on each side)
  const expectedOffset = (300 - 200) / 2; // 50px
  const actualXOffset = layout.productRect.x - layout.shadowedSubjectRect.x;
  const actualYOffset = layout.productRect.y - layout.shadowedSubjectRect.y;
  
  assertApproxEqual(actualXOffset, expectedOffset, 1, 'Product X offset should be 50px');
  assertApproxEqual(actualYOffset, expectedOffset, 1, 'Product Y offset should be 50px');
});

runTest('Layout: Scale affects all dimensions proportionally', () => {
  const baseLayout = computeCompositeLayout(
    1000, 1000,
    200, 200,
    160, 180,
    { x: 0.5, y: 1, scale: 1 }
  );
  
  const scaledLayout = computeCompositeLayout(
    1000, 1000,
    200, 200,
    160, 180,
    { x: 0.5, y: 1, scale: 2 }
  );
  
  // Width and height should be 2x
  assertApproxEqual(scaledLayout.shadowedSubjectRect.width, baseLayout.shadowedSubjectRect.width * 2, 1, 
    'Scaled width should be 2x');
  assertApproxEqual(scaledLayout.shadowedSubjectRect.height, baseLayout.shadowedSubjectRect.height * 2, 1, 
    'Scaled height should be 2x');
});

runTest('Layout: Reflection rect is below product rect', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    300, 300,
    200, 250,
    { x: 0.5, y: 1, scale: 1 }
  );
  
  // Reflection should start at product bottom
  const productBottom = layout.productRect.y + layout.productRect.height;
  assertApproxEqual(layout.reflectionRect.y, productBottom, 1, 'Reflection should start at product bottom');
  assertApproxEqual(layout.reflectionRect.x, layout.productRect.x, 1, 'Reflection X should match product X');
  assertApproxEqual(layout.reflectionRect.width, layout.productRect.width, 1, 'Reflection width should match product');
});

runTest('Layout: Canvas dimensions are rounded to integers', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    333, 333,
    250, 250,
    { x: 0.5, y: 0.75, scale: 1.33 }
  );
  
  // All dimensions should be integers
  assert(Number.isInteger(layout.canvasWidth), 'Canvas width should be integer');
  assert(Number.isInteger(layout.canvasHeight), 'Canvas height should be integer');
  assert(Number.isInteger(layout.shadowedSubjectRect.x), 'Subject X should be integer');
  assert(Number.isInteger(layout.shadowedSubjectRect.y), 'Subject Y should be integer');
  assert(Number.isInteger(layout.shadowedSubjectRect.width), 'Subject width should be integer');
  assert(Number.isInteger(layout.shadowedSubjectRect.height), 'Subject height should be integer');
});

runTest('Layout: X positioning centers subject horizontally', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    200, 200,
    160, 180,
    { x: 0.5, y: 1, scale: 1 }
  );
  
  // Subject center should be at canvas center
  const subjectCenter = layout.shadowedSubjectRect.x + layout.shadowedSubjectRect.width / 2;
  assertApproxEqual(subjectCenter, 500, 1, 'Subject center should be at canvas center (x=500)');
});

runTest('Layout: Edge case - scale=0.5 halves dimensions', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    400, 400,
    300, 350,
    { x: 0.5, y: 1, scale: 0.5 }
  );
  
  assertApproxEqual(layout.shadowedSubjectRect.width, 200, 1, 'Width should be 200 (half of 400)');
  assertApproxEqual(layout.shadowedSubjectRect.height, 200, 1, 'Height should be 200 (half of 400)');
});

/**
 * TEST SUITE 5: EDGE CASES
 * Tests boundary conditions and unusual inputs
 */

runTest('Edge: Very small scale still renders', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    200, 200,
    160, 180,
    { x: 0.5, y: 1, scale: 0.1 }
  );
  
  assert(layout.shadowedSubjectRect.width > 0, 'Width should be positive even at small scale');
  assert(layout.shadowedSubjectRect.height > 0, 'Height should be positive even at small scale');
});

runTest('Edge: Very large scale still calculates correctly', () => {
  const layout = computeCompositeLayout(
    1000, 1000,
    200, 200,
    160, 180,
    { x: 0.5, y: 1, scale: 5 }
  );
  
  assertApproxEqual(layout.shadowedSubjectRect.width, 1000, 1, 'Width should be 5x (1000)');
  assertApproxEqual(layout.shadowedSubjectRect.height, 1000, 1, 'Height should be 5x (1000)');
});

runTest('Edge: Asymmetric canvas aspect ratio', () => {
  const layout = computeCompositeLayout(
    1600, 900,  // 16:9 canvas
    200, 300,
    160, 260,
    { x: 0.5, y: 1, scale: 1 }
  );
  
  assertApproxEqual(layout.canvasWidth, 1600, 0, 'Canvas width should be 1600');
  assertApproxEqual(layout.canvasHeight, 900, 0, 'Canvas height should be 900');
});

runTest('Edge: Blur minimum prevents zero values', () => {
  // Very tiny canvas
  const blur = getScaledValue(9, 1); // 1px canvas
  assert(blur >= 0.5, 'Blur should be at least minimum (0.5)');
});

/**
 * Print test summary
 */
export function runAllTests(): { passed: number; failed: number; results: TestResult[] } {
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPOSITING ENGINE TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  
  console.log(`\nTotal Tests: ${testResults.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / testResults.length) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}`);
      console.log(`    Error: ${r.error}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  return { passed, failed, results: testResults };
}

console.log('\n🧪 Running Compositing Engine Tests...\n');
const summary = runAllTests();

export { testResults };
