// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BinaryViewer } from './BinaryViewer';
afterEach(cleanup);
it('shows escaped ASCII/hex and requests only the next bounded page', () => {
  const onPage = vi.fn();
  render(
    <BinaryViewer
      preview={{
        path: 'file.bin',
        size: 9000,
        offset: 0,
        data: btoa('\x00\xff<script>'),
        mime: '',
        image: false,
        more: true,
      }}
      loading={false}
      onPage={onPage}
    />,
  );
  expect(screen.getByText(/00 ff 3c 73/)).toBeTruthy();
  expect(document.querySelector('script')).toBeNull();
  fireEvent.click(screen.getByText('下一页'));
  expect(onPage).toHaveBeenCalledWith(4096);
  expect((screen.getByText('上一页') as HTMLButtonElement).disabled).toBe(true);
});
it('previews raster bytes in an image without editor inputs', () => {
  render(
    <BinaryViewer
      preview={{
        path: 'image.png',
        size: 100,
        offset: 0,
        data: 'AAAA',
        mime: 'image/png',
        image: true,
        more: false,
      }}
      loading={false}
      onPage={vi.fn()}
    />,
  );
  expect(screen.getByRole('img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
  expect(screen.queryByRole('textbox')).toBeNull();
});
