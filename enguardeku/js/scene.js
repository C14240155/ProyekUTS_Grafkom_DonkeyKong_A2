// Hierarchical scene graph. Each node's local transform is
//   local = base * pose
// where `base` is the fixed placement relative to the parent (set once while
// modelling) and `pose` is the animated part (rewritten every frame).
// A node's world matrix is the product of all local matrices from the root
// down to it, accumulated with a matrix stack while drawing.
(function (global) {
  "use strict";

  class SceneNode {
    constructor(name, { mesh = null, material = null, base = null } = {}) {
      this.name = name;
      this.mesh = mesh;
      this.material = material;
      this.base = base || mat4.identity();
      this.pose = mat4.identity();
      this.children = [];
      // Optional rotation axis to visualise: { point, dir } in the node's
      // frame after `base` (the frame its `pose` rotates in).
      this.debugAxis = null;
      this.worldMatrix = mat4.identity();
    }

    add(...nodes) {
      this.children.push(...nodes);
      return this;
    }

    find(name) {
      if (this.name === name) return this;
      for (const c of this.children) {
        const r = c.find(name);
        if (r) return r;
      }
      return null;
    }

    // Depth-first traversal with an explicit matrix stack.
    traverse(stack, visit) {
      stack.push();
      stack.apply(this.base);
      // frame the pose rotates in (where debugAxis is expressed)
      const pivotFrame = stack.current;
      stack.apply(this.pose);
      this.worldMatrix = stack.current;
      visit(this, pivotFrame);
      for (const c of this.children) c.traverse(stack, visit);
      stack.pop();
    }
  }

  global.SceneNode = SceneNode;
})(window);
