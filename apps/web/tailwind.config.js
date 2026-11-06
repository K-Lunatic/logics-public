module.exports = {
  theme: {
    extend: {
      keyframes: {
        // 개수 등 데이터가 변경되었을 때 은은하게 블러처리 되었다가 돌아오는 효과
        'diff-blur': {
          '0%': { filter: 'blur(0px)', opacity: '1' },
          '30%': { filter: 'blur(3px)', opacity: '0.6', transform: 'scale(0.98)' },
          '100%': { filter: 'blur(0px)', opacity: '1', transform: 'scale(1)' },
        },
        // 새 카드가 인젝션되었을 때 밑에서 위로 부드럽게 튀어나오는 효과
        'diff-pop': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.95)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        }
      },
      animation: {
        'mutate-update': 'diff-blur 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'mutate-add': 'diff-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      }
    },
  },
}
