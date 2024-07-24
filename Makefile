NAME := swayosd
GITNAME := SwayOSD
BRANCH := main
COMMIT ?= \$(shell grep '^%global commit' swayosd.spec | awk '{print $$3}')

.PHONY: all vendor clean

all: vendor clean


vendor:
	# After vendorize we need to remove winapi/windows binaries
	tar xf $(NAME)-$(BRANCH)-$(COMMIT).tar.gz && \
	pushd $(GITNAME)-$(COMMIT) && \
	cargo vendor && \
	tar Jcvf ../$(NAME)-$(COMMIT)-vendor.tar.xz vendor/ && \
	popd

clean:
	rm -rf $(GITNAME)-$(COMMIT)
