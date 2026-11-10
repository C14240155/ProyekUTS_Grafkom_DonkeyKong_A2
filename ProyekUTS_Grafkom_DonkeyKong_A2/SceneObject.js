// SceneObject.js : Mesh (buffer GPU, dibuat SEKALI) + SceneObject (node hierarki, boleh banyak instance)

export class Mesh {
    constructor(GL, geometry) {
        if (geometry.vertices.length / 9 > 65535) {
            console.warn("Vertex > 65535, kurangi resolusi (Uint16Array).");
        }
        this.GL = GL;
        this.faceCount = geometry.faces.length;

        this.vbo = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
        GL.bufferData(GL.ARRAY_BUFFER, new Float32Array(geometry.vertices), GL.STATIC_DRAW);

        this.ebo = GL.createBuffer();
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);
        GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.faces), GL.STATIC_DRAW);
    }
}

export class SceneObject {
    constructor(ctx, mesh = null, name = "") {
        this.ctx = ctx;
        this.mesh = mesh;      
        this.name = name;

        this.POSITION_MATRIX = LIBS.get_I4(); 
        this.MOVE_MATRIX = LIBS.get_I4();     
        this.MODEL_MATRIX = LIBS.get_I4();

        this.tint = [1, 1, 1];  
        this.unlit = 0;   
        this.childs = [];
    }

    add(...children) {
        this.childs.push(...children);
        return this;
    }

    find(name) {
        if (this.name === name) return this;
        for (const c of this.childs) {
            const r = c.find(name);
            if (r) return r;
        }
        return null;
    }

    render(PARENT_MATRIX = LIBS.get_I4()) {
        this.MODEL_MATRIX = LIBS.multiply(
            LIBS.multiply(this.MOVE_MATRIX, this.POSITION_MATRIX),
            PARENT_MATRIX
        );

        if (this.mesh) {
            const GL = this.ctx.GL, c = this.ctx;
            GL.uniformMatrix4fv(c.uM, false, this.MODEL_MATRIX);
            GL.uniform3fv(c.uTint, this.tint);
            GL.uniform1f(c.uUnlit, this.unlit);

            GL.bindBuffer(GL.ARRAY_BUFFER, this.mesh.vbo);
            GL.vertexAttribPointer(c.aPosition, 3, GL.FLOAT, false, 36, 0);
            GL.vertexAttribPointer(c.aColor, 3, GL.FLOAT, false, 36, 12);
            GL.vertexAttribPointer(c.aNormal, 3, GL.FLOAT, false, 36, 24);
            GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.mesh.ebo);
            GL.drawElements(GL.TRIANGLES, this.mesh.faceCount, GL.UNSIGNED_SHORT, 0);
        }

        this.childs.forEach(child => child.render(this.MODEL_MATRIX));
    }
}
