import {createRangeEngine} from './range-engine.js';

const calculateRange = createRangeEngine();
self.addEventListener('message', async event => {
  const {id, projects, start, end} = event.data;
  try {
    self.postMessage({id, result: await calculateRange(projects, start, end)});
  } catch (error) {
    self.postMessage({id, error: error.message});
  }
});
