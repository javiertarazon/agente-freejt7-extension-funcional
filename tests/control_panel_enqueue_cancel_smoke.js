'use strict';

const assert = require('assert');

const { __testing } = require('../src-js/core/control-panel.js');

async function testCancelsWithoutEnqueueWhenPrepareTaskReturnsNull() {
  let enqueued = 0;
  let persistedSessionId = '';
  let postStateCalls = 0;
  const messages = [];

  const result = await __testing.handleTaskEnqueueRequest({
    engine: {
      enqueueTask() {
        enqueued += 1;
      },
    },
    persistActiveSessionId: async (sessionId) => {
      persistedSessionId = sessionId;
    },
    prepareTask: async () => null,
    sessionId: 'sess-cancel',
    taskInput: { goal: 'sin intake valido' },
    getSessionTitle: () => 'Sesion cancelada',
    postMessage: async (message) => {
      messages.push(message);
    },
    postState: async () => {
      postStateCalls += 1;
    },
  });

  assert.equal(persistedSessionId, 'sess-cancel');
  assert.equal(enqueued, 0, 'no debe invocar enqueueTask cuando prepareTask cancela');
  assert.equal(postStateCalls, 1, 'debe refrescar el estado del panel tras cancelar');
  assert.equal(result.cancelled, true);
  assert.equal(result.taskInput, null);
  assert.deepEqual(messages, [{
    type: 'task.enqueue.cancelled',
    reason: 'intake-required',
    sessionId: 'sess-cancel',
  }]);
}

async function testEnqueuesPreparedTaskWhenPrepareTaskSucceeds() {
  const enqueued = [];
  let postStateCalls = 0;
  const messages = [];

  const result = await __testing.handleTaskEnqueueRequest({
    engine: {
      enqueueTask(sessionId, taskInput) {
        enqueued.push({ sessionId, taskInput });
      },
    },
    persistActiveSessionId: async () => {},
    prepareTask: async (taskInput, meta) => ({
      ...taskInput,
      goal: taskInput.goal + ' preparado',
      meta,
    }),
    sessionId: 'sess-ok',
    taskInput: { goal: 'ejecutar tarea' },
    getSessionTitle: () => 'Sesion viva',
    postMessage: async (message) => {
      messages.push(message);
    },
    postState: async () => {
      postStateCalls += 1;
    },
  });

  assert.equal(result.cancelled, false);
  assert.equal(postStateCalls, 1, 'debe refrescar el estado tras encolar');
  assert.equal(messages.length, 0, 'no debe emitir cancelación en el camino feliz');
  assert.equal(enqueued.length, 1, 'debe invocar enqueueTask exactamente una vez');
  assert.equal(enqueued[0].sessionId, 'sess-ok');
  assert.equal(enqueued[0].taskInput.goal, 'ejecutar tarea preparado');
  assert.equal(enqueued[0].taskInput.meta.sessionId, 'sess-ok');
  assert.equal(enqueued[0].taskInput.meta.sessionTitle, 'Sesion viva');
}

async function main() {
  await testCancelsWithoutEnqueueWhenPrepareTaskReturnsNull();
  await testEnqueuesPreparedTaskWhenPrepareTaskSucceeds();
  console.log('control_panel_enqueue_cancel_smoke: ok');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});