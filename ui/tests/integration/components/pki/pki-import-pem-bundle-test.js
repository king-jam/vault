/**
 * Copyright (c) HashiCorp, Inc.
 * SPDX-License-Identifier: MPL-2.0
 */

import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render, click, fillIn } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import { setupEngine } from 'ember-engines/test-support';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { issuerPemBundle } from 'vault/tests/helpers/pki/values';

module('Integration | Component | PkiImportPemBundle', function (hooks) {
  setupRenderingTest(hooks);
  setupMirage(hooks);
  setupEngine(hooks, 'pki'); // https://github.com/ember-engines/ember-engines/pull/653

  hooks.beforeEach(function () {
    this.store = this.owner.lookup('service:store');
    this.model = this.store.createRecord('pki/action');
    this.backend = 'pki-test';
    this.secretMountPath = this.owner.lookup('service:secret-mount-path');
    this.secretMountPath.currentPath = this.backend;
    this.pemBundle = issuerPemBundle;
    this.onComplete = () => {};
  });

  test('it renders import and updates model', async function (assert) {
    assert.expect(3);
    await render(
      hbs`
      <PkiImportPemBundle
         @model={{this.model}}
         @onCancel={{this.onCancel}}
         @onSave={{this.onSave}}
         @onComplete={{this.onComplete}}
       />
      `,
      { owner: this.engine }
    );

    assert.dom('[data-test-pki-import-pem-bundle-form]').exists('renders form');
    assert.dom('[data-test-component="text-file"]').exists('renders text file input');
    await click('[data-test-text-toggle]');
    await fillIn('[data-test-text-file-textarea]', this.pemBundle);
    assert.strictEqual(this.model.pemBundle, this.pemBundle);
  });

  test('it sends correct payload to import endpoint', async function (assert) {
    assert.expect(4);
    this.server.post(`/${this.backend}/issuers/import/bundle`, (schema, req) => {
      assert.ok(true, 'Request made to the correct endpoint to import issuer');
      const request = JSON.parse(req.requestBody);
      assert.propEqual(
        request,
        {
          pem_bundle: `${this.pemBundle}`,
        },
        'sends params in correct type'
      );
      return {
        data: {
          mapping: { 'issuer-id': 'key-id' },
        },
      };
    });

    this.onSave = () => assert.ok(true, 'onSave callback fires on save success');

    await render(
      hbs`
      <PkiImportPemBundle
         @model={{this.model}}
         @onCancel={{this.onCancel}}
         @onSave={{this.onSave}}
         @onComplete={{this.onComplete}}
         @adapterOptions={{hash actionType="import" useIssuer=true}}
       />
      `,
      { owner: this.engine }
    );

    await click('[data-test-text-toggle]');
    await fillIn('[data-test-text-file-textarea]', this.pemBundle);
    assert.strictEqual(this.model.pemBundle, this.pemBundle, 'PEM bundle updated on model');
    await click('[data-test-pki-import-pem-bundle]');
  });

  test('it hits correct endpoint when userIssuer=false', async function (assert) {
    assert.expect(4);
    this.server.post(`${this.backend}/config/ca`, (schema, req) => {
      assert.ok(true, 'Request made to the correct endpoint to import issuer');
      const request = JSON.parse(req.requestBody);
      assert.propEqual(
        request,
        {
          pem_bundle: `${this.pemBundle}`,
        },
        'sends params in correct type'
      );
      return {
        data: {
          mapping: {},
        },
      };
    });

    this.onSave = () => assert.ok(true, 'onSave callback fires on save success');

    await render(
      hbs`
      <PkiImportPemBundle
         @model={{this.model}}
         @onCancel={{this.onCancel}}
         @onSave={{this.onSave}}
         @onComplete={{this.onComplete}}
         @adapterOptions={{hash actionType="import" useIssuer=false}}
       />
      `,
      { owner: this.engine }
    );

    await click('[data-test-text-toggle]');
    await fillIn('[data-test-text-file-textarea]', this.pemBundle);
    assert.strictEqual(this.model.pemBundle, this.pemBundle);
    await click('[data-test-pki-import-pem-bundle]');
  });

  test('it shows the bundle mapping on success', async function (assert) {
    assert.expect(7);
    this.server.post(`/${this.backend}/issuers/import/bundle`, () => {
      return {
        data: {
          imported_issuers: ['issuer-id', 'another-issuer'],
          imported_keys: ['key-id', 'another-key'],
          mapping: { 'issuer-id': 'key-id', 'another-issuer': null },
        },
      };
    });

    this.onSave = () => assert.ok(true, 'onSave callback fires on save success');
    this.onComplete = () => assert.ok(true, 'onComplete callback fires on done button click');

    await render(
      hbs`
      <PkiImportPemBundle
         @model={{this.model}}
         @onCancel={{this.onCancel}}
         @onSave={{this.onSave}}
         @onComplete={{this.onComplete}}
         @adapterOptions={{hash actionType="import" useIssuer=true}}
       />
      `,
      { owner: this.engine }
    );

    await click('[data-test-text-toggle]');
    await fillIn('[data-test-text-file-textarea]', this.pemBundle);
    await click('[data-test-pki-import-pem-bundle]');

    assert
      .dom('[data-test-import-pair]')
      .exists({ count: 2 }, 'Shows correct number of rows for imported items');
    // Check that each row has expected values
    assert.dom('[data-test-import-pair="issuer-id_key-id"] [data-test-imported-issuer]').hasText('issuer-id');
    assert.dom('[data-test-import-pair="issuer-id_key-id"] [data-test-imported-key]').hasText('key-id');
    assert
      .dom('[data-test-import-pair="another-issuer_"] [data-test-imported-issuer]')
      .hasText('another-issuer');
    assert.dom('[data-test-import-pair="another-issuer_"] [data-test-imported-key]').hasText('None');
    // TODO VAULT-14791
    // assert.dom('[data-test-import-pair="_another-key"] [data-test-imported-issuer]').hasText('None');
    // assert.dom('[data-test-import-pair="_another-key"] [data-test-imported-key]').hasText('another-key');
    await click('[data-test-done]');
  });

  test('it should unload record on cancel', async function (assert) {
    assert.expect(2);
    this.onCancel = () => assert.ok(true, 'onCancel callback fires');
    await render(
      hbs`
        <PkiImportPemBundle
          @model={{this.model}}
          @onCancel={{this.onCancel}}
          @onComplete={{this.onComplete}}
          @onSave={{this.onSave}}
        />
      `,
      { owner: this.engine }
    );

    await click('[data-test-pki-ca-cert-cancel]');
    assert.true(this.model.isDestroyed, 'new model is unloaded on cancel');
  });
});
