const EXPLORER = (() => {
  const POINTS = {
    reuse: {
      title: 'Reuse K/V from fixed conditioning',
      description:
        'When conditioning and its K/V projections stay the same across denoising steps, computing them once avoids repeating the same work.',
      before:
        'for t in timesteps:\n    k_ctx = key_proj(fixed_context)\n    v_ctx = value_proj(fixed_context)\n    x = denoise(x, t, k_ctx, v_ctx)',
      after:
        'k_ctx = key_proj(fixed_context)\nv_ctx = value_proj(fixed_context)\n\nfor t in timesteps:\n    x = denoise(x, t, k_ctx, v_ctx)',
      effect:
        'Reuse the cached keys and values at each step. Queries and attention still need to be computed each time.',
      lanes: ['CPU', 'GPU'],
      diagramLabel:
        'Repeated conditioning K/V projections are removed. All three denoising steps remain.',
      beforeScene: {
        caption: 'Conditioning K/V repeats at every step',
        bars: [
          [0, 0, 17, 'submit', 'cpu'],
          [0, 32, 17, 'submit', 'cpu'],
          [0, 64, 17, 'submit', 'cpu'],
          [1, 4, 19, 'Cond. K/V', 'gpu'],
          [1, 23, 12, 'D1', 'gpu'],
          [1, 36, 19, 'Cond. K/V', 'gpu'],
          [1, 55, 12, 'D2', 'gpu'],
          [1, 68, 19, 'Cond. K/V', 'gpu'],
          [1, 87, 12, 'D3', 'gpu'],
        ],
      },
      afterScene: {
        caption: 'Fixed conditioning, computed once',
        bars: [
          [0, 0, 32, 'submit', 'cpu'],
          [1, 4, 19, 'Cond. K/V', 'gpu'],
          [1, 23, 12, 'D1', 'gpu'],
          [1, 36, 12, 'D2', 'gpu'],
          [1, 49, 12, 'D3', 'gpu'],
        ],
        brackets: [[1, 23, 61, 'Fixed conditioning K/V reused']],
      },
    },
    host: {
      title: 'Reduce launch overhead with CUDA Graphs',
      description:
        'Launching short GPU kernels one by one from Python can leave the GPU waiting between launches.',
      before: 'for t in timesteps:\n    x = denoise(x, t, context)',
      after:
        'static_x.copy_(x)\nstatic_context.copy_(context)\ngraph.replay()\nx = static_output.clone()',
      effect: 'Capture the denoising loop once, then replay it with a single call.',
      lanes: ['CPU', 'GPU'],
      diagramLabel:
        'Four CPU launches leave GPU gaps. Graph replay submits the same kernels together, with input and output copies included.',
      beforeScene: {
        caption: 'Waiting for the next launch',
        bars: [
          [0, 0, 14, 'submit', 'cpu'],
          [0, 25, 14, 'submit', 'cpu'],
          [0, 50, 14, 'submit', 'cpu'],
          [0, 75, 14, 'submit', 'cpu'],
          [1, 14, 10, 'K1', 'gpu'],
          [1, 24, 15, '', 'wait'],
          [1, 39, 10, 'K2', 'gpu'],
          [1, 49, 15, '', 'wait'],
          [1, 64, 10, 'K3', 'gpu'],
          [1, 74, 15, '', 'wait'],
          [1, 89, 10, 'K4', 'gpu'],
        ],
      },
      afterScene: {
        caption: 'Same kernels, fewer launch gaps',
        bars: [
          [0, 0, 24, 'replay', 'cpu'],
          [1, 8, 9, 'in', 'transfer'],
          [1, 18, 10, 'K1', 'gpu'],
          [1, 29, 10, 'K2', 'gpu'],
          [1, 40, 10, 'K3', 'gpu'],
          [1, 51, 10, 'K4', 'gpu'],
          [1, 62, 9, 'out', 'transfer'],
        ],
        brackets: [[1, 8, 71, 'Input and output copies included']],
      },
    },
    compiler: {
      example: 'Graph breaks',
      title: 'Move fixed branch decisions out of the graph',
      description:
        'A Python if statement that depends on a GPU tensor can break a compiled graph into separate parts.',
      before:
        '@torch.compile\ndef step(x, use_extra):\n    if use_extra.any():\n        y = extra_path(x)\n    else:\n        y = base_path(x)\n    return finish(y)',
      after:
        'use_extra = config.use_extra\n\n@torch.compile(fullgraph=True)\ndef step(x):\n    if use_extra:\n        y = extra_path(x)\n    else:\n        y = base_path(x)\n    return finish(y)',
      effect:
        'If the branch is fixed by configuration, use that value so the compiler can capture the chosen path in one graph.',
      lanes: ['CPU', 'GPU'],
      axis: 'Execution order',
      diagramLabel:
        'A Python decision on a GPU value separates two compiled regions. Resolving the decision on the host before tracing leaves one compiled region without a device read.',
      beforeScene: {
        caption: 'Python control flow splits the graph',
        bars: [
          [0, 0, 14, 'submit', 'cpu'],
          [0, 30, 25, 'Python if', 'cpu'],
          [0, 55, 14, 'submit', 'cpu'],
          [1, 14, 16, 'test', 'gpu'],
          [1, 69, 30, 'path', 'gpu'],
        ],
        arrows: [
          [1, 30, 0, 30],
          [0, 69, 1, 69],
        ],
        brackets: [
          [1, 14, 30, 'Graph 1'],
          [1, 69, 99, 'Graph 2'],
        ],
      },
      afterScene: {
        caption: 'The decision is made before tracing',
        bars: [
          [0, 0, 25, 'submit', 'cpu'],
          [1, 14, 30, 'path', 'gpu'],
        ],
        brackets: [[1, 14, 44, 'One compiled region']],
      },
    },
    sync: {
      example: 'Synchronization',
      title: 'Select values on the GPU',
      description:
        'Calling .item() on a GPU tensor makes Python wait for the result before choosing what to run next.',
      before:
        'needs_update = score > threshold\nif needs_update.item():\n    state = candidate\nelse:\n    state = previous\ny = consume(state)',
      after:
        'needs_update = score > threshold\nstate = torch.where(\n    needs_update, candidate, previous\n)\ny = consume(state)',
      effect:
        'Use torch.where to select the result on the GPU, so Python can keep submitting work.',
      lanes: ['CPU', 'GPU'],
      diagramLabel:
        'The CPU waits for a GPU predicate, branches, then resumes submitting GPU work. Tensor selection keeps the decision on the device.',
      beforeScene: {
        caption: 'GPU result → CPU decision → GPU',
        bars: [
          [0, 0, 14, 'submit', 'cpu'],
          [0, 14, 23, 'wait', 'wait'],
          [0, 37, 20, 'branch', 'cpu'],
          [0, 57, 14, 'submit', 'cpu'],
          [1, 14, 20, 'compare', 'gpu'],
          [1, 34, 37, 'idle', 'wait'],
          [1, 71, 27, 'consume', 'gpu'],
        ],
        arrows: [
          [1, 34, 0, 37],
          [0, 71, 1, 71],
        ],
      },
      afterScene: {
        caption: 'Selection stays on the device',
        bars: [
          [0, 0, 32, 'submit', 'cpu'],
          [1, 14, 20, 'compare', 'gpu'],
          [1, 35, 17, 'select', 'gpu'],
          [1, 53, 27, 'consume', 'gpu'],
        ],
      },
    },
    memory: {
      title: 'Fuse operators to reduce memory traffic',
      description:
        'Separate normalization, modulation, and residual kernels write intermediate results to GPU memory, then read them back for the next operation.',
      before:
        'normalized = (x - mean) * inv_std\nmodulated = normalized * scale + shift\ny = residual + gate * modulated',
      after:
        '@torch.compile(fullgraph=True)\ndef update(x, mean, inv_std, scale, shift,\n           gate, residual):\n    normalized = (x - mean) * inv_std\n    modulated = normalized * scale + shift\n    return residual + gate * modulated',
      effect:
        'A fused kernel keeps these intermediate results inside the kernel, reducing memory traffic and kernel launches.',
      lanes: ['CPU', 'GPU', 'Memory'],
      diagramLabel:
        'Separate operators read and write intermediate tensors in GPU memory. A fused update retains intermediates within the kernel. R means read; W means write.',
      beforeScene: {
        caption: 'Intermediates written to GPU memory',
        bars: [
          [0, 0, 12, 'submit', 'cpu'],
          [0, 33, 12, 'submit', 'cpu'],
          [0, 66, 12, 'submit', 'cpu'],
          [1, 16, 12, 'norm', 'gpu'],
          [1, 49, 12, 'mod', 'gpu'],
          [1, 82, 12, 'add', 'gpu'],
          [2, 9, 6, 'R', 'transfer'],
          [2, 28, 5, 'W', 'transfer'],
          [2, 42, 6, 'R', 'transfer'],
          [2, 61, 5, 'W', 'transfer'],
          [2, 75, 6, 'R', 'transfer'],
          [2, 94, 5, 'W', 'transfer'],
        ],
        arrows: [
          [2, 15, 1, 16],
          [1, 28, 2, 28],
          [2, 48, 1, 49],
          [1, 61, 2, 61],
          [2, 81, 1, 82],
          [1, 94, 2, 94],
        ],
      },
      afterScene: {
        caption: 'Intermediates stay in the kernel',
        bars: [
          [0, 0, 16, 'submit', 'cpu'],
          [1, 18, 39, 'fused update', 'gpu'],
          [2, 9, 8, 'R', 'transfer'],
          [2, 57, 8, 'W', 'transfer'],
        ],
        arrows: [
          [2, 17, 1, 18],
          [1, 57, 2, 57],
        ],
        brackets: [[2, 9, 65, 'R: tensor read · W: tensor write']],
      },
    },
    compute: {
      title: 'Use lower precision for projections',
      description:
        'Large matrix multiplications can dominate inference time. FP8 can make these projections faster on GPUs that support it.',
      before: 'y = torch.nn.functional.linear(\n    x, weight, bias\n)',
      after:
        'x_fp8, x_scale = quantize_per_token(x)\ny = scaled_gemm(\n    x_fp8, weight_fp8,\n    x_scale, weight_scale,\n    bias=bias,\n    out_dtype=torch.bfloat16,\n)',
      effect:
        'The faster matrix multiplication must save more time than activation scaling, casting, and layout changes add.',
      approximate: true,
      lanes: ['CPU', 'GPU'],
      diagramLabel:
        'A BF16 projection is replaced by activation quantization and a lower-precision GEMM. Quantization overhead remains on the inference path.',
      beforeScene: {
        caption: 'Projection dominates runtime',
        bars: [
          [0, 0, 18, 'submit', 'cpu'],
          [1, 10, 84, 'BF16 projection', 'gpu'],
        ],
      },
      afterScene: {
        caption: 'Include quantization overhead',
        bars: [
          [0, 0, 32, 'submit', 'cpu'],
          [1, 10, 23, 'scale / cast', 'gpu'],
          [1, 34, 38, 'FP8 projection', 'gpu'],
        ],
        brackets: [[1, 10, 72, 'Quantization + GEMM']],
      },
    },
    serialization: {
      title: 'Run independent video and action experts together',
      description:
        'Within each layer, the video and action experts can run at the same time if neither needs the output of the other.',
      before:
        'for layer in layers:\n    video = layer.video_expert(video)\n    action = layer.action_expert(action)\n    video, action = layer.joint(video, action)',
      after:
        'main = torch.cuda.current_stream()\nfor layer in layers:\n    side.wait_stream(main)\n    with torch.cuda.stream(side):\n        action.record_stream(side)\n        action = layer.action_expert(action)\n    video = layer.video_expert(video)\n    main.wait_stream(side)\n    video, action = layer.joint(video, action)',
      effect:
        'Use a second CUDA stream to overlap the two experts, then wait for both before joint attention.',
      lanes: ['CPU', 'Stream 1', 'Stream 2'],
      diagramLabel:
        'In each layer, video and action experts run sequentially on one stream. A second stream overlaps the independent experts, and both join before joint attention.',
      beforeScene: {
        caption: 'One GPU · sequential experts',
        bars: [
          [0, 0, 25, 'submit', 'cpu'],
          [1, 4, 13, 'video', 'gpu'],
          [1, 17, 13, 'action', 'gpu'],
          [1, 30, 10, 'joint', 'gpu'],
          [1, 41, 13, 'video', 'gpu'],
          [1, 54, 13, 'action', 'gpu'],
          [1, 67, 10, 'joint', 'gpu'],
        ],
        notes: [[2, 48, 'Unused stream']],
      },
      afterScene: {
        caption: 'One GPU · concurrent experts',
        bars: [
          [0, 0, 25, 'submit', 'cpu'],
          [1, 4, 13, 'video', 'gpu'],
          [1, 20, 10, 'joint', 'gpu'],
          [1, 33, 13, 'video', 'gpu'],
          [1, 49, 10, 'joint', 'gpu'],
          [2, 4, 13, 'action', 'gpu'],
          [2, 33, 13, 'action', 'gpu'],
        ],
        arrows: [
          [2, 17, 1, 20],
          [1, 30, 2, 33],
          [2, 46, 1, 49],
        ],
        brackets: [
          [2, 4, 17, 'Overlap'],
          [2, 33, 46, 'Overlap'],
        ],
      },
    },
    loading: {
      startup: true,
      title: 'Skip parameter initialization before loading',
      description:
        'Building a model often fills its parameters with random values that the checkpoint immediately overwrites.',
      before:
        'model = Policy(config)\nstate = load_file(path)\nmodel.load_state_dict(state)\nmodel.to(device)',
      after:
        'with init_empty_weights(include_buffers=False):\n    model = Policy(config)\nstate = load_file(path)\nmodel.load_state_dict(state, assign=True)\nmodel.to(device)',
      effect:
        'Create empty parameters and load the checkpoint directly into them to reduce startup time.',
      lanes: ['CPU', 'Copy'],
      diagramLabel:
        'Construction randomly initializes every parameter before loading overwrites it. Empty construction skips that initialization; the checkpoint read and device transfer remain.',
      beforeScene: {
        caption: 'Initialize, then overwrite',
        bars: [
          [0, 0, 40, 'random init', 'cpu'],
          [1, 40, 24, 'read', 'transfer'],
          [0, 64, 12, 'load', 'cpu'],
          [1, 76, 20, 'H2D', 'transfer'],
        ],
      },
      afterScene: {
        caption: 'Parameters start on the meta device',
        bars: [
          [0, 0, 18, 'meta init', 'cpu'],
          [1, 18, 24, 'read', 'transfer'],
          [1, 43, 20, 'H2D', 'transfer'],
        ],
        notes: [[0, 62, 'No random initialization']],
      },
    },
  };
  const EXAMPLES = {
    compiler: {
      breaks: POINTS.compiler,
      fallbacks: {
        example: 'Kernel fallbacks',
        title: 'Write RoPE with operations the compiler can fuse',
        description:
          'Some backends cannot fuse complex-valued RoPE, even when it stays inside a single compiled graph.',
        before:
          'pairs = x.double().reshape(\n    *x.shape[:-1], -1, 2\n)\nz = torch.view_as_complex(pairs)\nphase = torch.complex(cos, sin)\ny = torch.view_as_real(z * phase)\ny = y.flatten(-2).to(x.dtype)',
        after:
          '@torch.compile(fullgraph=True)\ndef rope(x, cos, sin):\n    real = x[..., 0::2].double()\n    imag = x[..., 1::2].double()\n    pair = torch.stack((\n        real * cos - imag * sin,\n        real * sin + imag * cos,\n    ), dim=-1)\n    return pair.flatten(-2).to(x.dtype)',
        effect:
          'Write the same rotation using real-valued operations so the compiler can fuse them.',
        lanes: ['CPU', 'GPU'],
        diagramLabel:
          'The graph stays intact, but complex rotary operations use separate kernel paths. Equivalent real-valued rotary expressions allow a supported fused kernel without changing arithmetic precision.',
        beforeScene: {
          caption: 'One graph can still contain fallbacks',
          bars: [
            [0, 0, 24, 'submit', 'cpu'],
            [1, 12, 30, 'complex mul', 'gpu'],
            [1, 44, 22, 'layout', 'transfer'],
            [1, 68, 22, 'cast', 'gpu'],
          ],
          brackets: [[1, 12, 90, 'Inside one compiled region']],
        },
        afterScene: {
          caption: 'Supported lowering enables fusion',
          bars: [
            [0, 0, 24, 'submit', 'cpu'],
            [1, 12, 46, 'fused real RoPE', 'gpu'],
          ],
          brackets: [[1, 12, 58, 'Same precision and rotary math']],
        },
      },
      shapes: {
        example: 'Recompilation',
        title: 'Group input lengths to avoid recompilation',
        description:
          'With static shapes, a new input length can trigger another compilation during inference.',
        before: 'run = torch.compile(model, dynamic=False)\n\nfor x in requests:\n    y = run(x)',
        after:
          'run = torch.compile(model, dynamic=False)\nbuckets = (32, 64, 128)\n\nfor x in requests:\n    n = x.shape[1]\n    b = next(b for b in buckets if n <= b)\n    padded = F.pad(x, (0, 0, 0, b - n))\n    valid = torch.arange(b, device=x.device) < n\n    y = run(padded, valid_mask=valid)[:, :n]',
        effect:
          'Pad inputs to a few fixed lengths and warm up each one in advance to reuse the compiled graphs.',
        lanes: ['CPU', 'GPU'],
        diagramLabel:
          'Previously unseen lengths of 33, 37, and 45 tokens each trigger compilation. Padding to a prewarmed 64-token bucket reuses one specialization while adding some GPU work.',
        beforeScene: {
          caption: 'New length → new compilation',
          bars: [
            [0, 0, 18, 'compile', 'cpu'],
            [0, 30, 18, 'compile', 'cpu'],
            [0, 60, 18, 'compile', 'cpu'],
            [1, 18, 12, '33', 'gpu'],
            [1, 48, 12, '37', 'gpu'],
            [1, 78, 12, '45', 'gpu'],
          ],
          brackets: [[1, 18, 90, 'Request lengths: 33, 37, 45']],
        },
        afterScene: {
          caption: 'Reuse a prewarmed 64-token bucket',
          bars: [
            [0, 0, 15, 'pad', 'cpu'],
            [0, 22, 15, 'pad', 'cpu'],
            [0, 44, 15, 'pad', 'cpu'],
            [1, 15, 14, '64', 'gpu'],
            [1, 37, 14, '64', 'gpu'],
            [1, 59, 14, '64', 'gpu'],
          ],
          brackets: [[1, 15, 73, 'Padding adds some GPU work']],
        },
      },
    },
    sync: {
      sync: POINTS.sync,
      transfers: {
        example: 'Transfers',
        title: 'Keep reusable constants on the GPU',
        description:
          'Constants stored on the CPU may be copied to the GPU again on every inference call.',
        before:
          'def forward(self, x):\n    mean = self.mean_cpu.to(x.device)\n    inv_std = self.inv_std_cpu.to(x.device)\n    return (x - mean) * inv_std',
        after:
          'self.register_buffer("mean", mean)\nself.register_buffer("inv_std", inv_std)\nself.to(device)\n\ndef forward(self, x):\n    return (x - self.mean) * self.inv_std',
        effect: 'Move these constants to the GPU once and reuse them across calls.',
        lanes: ['CPU', 'Copy', 'GPU'],
        diagramLabel:
          'Three calls each transfer the same constants before normalization. Resident device buffers remove those repeated copies.',
        beforeScene: {
          caption: 'Same constants cross again',
          bars: [
            [0, 0, 18, 'submit', 'cpu'],
            [0, 33, 18, 'submit', 'cpu'],
            [0, 66, 18, 'submit', 'cpu'],
            [1, 8, 12, 'H2D', 'transfer'],
            [1, 41, 12, 'H2D', 'transfer'],
            [1, 74, 12, 'H2D', 'transfer'],
            [2, 20, 12, 'norm', 'gpu'],
            [2, 53, 12, 'norm', 'gpu'],
            [2, 86, 12, 'norm', 'gpu'],
          ],
          arrows: [
            [1, 20, 2, 20],
            [1, 53, 2, 53],
            [1, 86, 2, 86],
          ],
        },
        afterScene: {
          caption: 'Constants already on the GPU',
          bars: [
            [0, 0, 30, 'submit', 'cpu'],
            [2, 8, 12, 'norm', 'gpu'],
            [2, 22, 12, 'norm', 'gpu'],
            [2, 36, 12, 'norm', 'gpu'],
          ],
          notes: [[1, 48, 'No recurring copy']],
        },
      },
    },
  };

  return { POINTS, EXAMPLES };
})();
